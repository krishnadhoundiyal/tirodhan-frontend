import {
  CommandError,
  isCommand,
  type Command,
  type CommandResult,
} from './api/commands';
import type { ManagerSession } from './auth/session';

export interface CommandContext {
  rider?: string;
  incident?: string;
  replacement?: string;
  booking?: string;
}
export interface CommandRecord {
  readonly id: number;
  readonly command: Command;
  readonly context: CommandContext;
  readonly createdAt: number;
  readonly phase:
    | 'review'
    | 'submitting'
    | 'accepted'
    | 'completed'
    | 'uncertain'
    | 'conflict'
    | 'rejected';
  readonly result?: CommandResult;
  readonly message?: string;
  readonly code?: string | null;
}

/** Session-memory journal: never persists credentials or operational decisions to browser storage. */
export class CommandStore {
  #records: readonly CommandRecord[] = [];
  #listeners = new Set<() => void>();
  #next = 0;
  #epoch: number;
  #unsubscribe: () => void;
  constructor(
    private session: ManagerSession,
    private allowed: (command: Command) => boolean,
    private refresh: (
      command: Command,
      context: CommandContext,
    ) => Promise<unknown>,
  ) {
    this.#epoch = session.snapshot().epoch;
    this.#unsubscribe = session.subscribe(() => {
      if (this.#epoch !== session.snapshot().epoch) {
        this.#epoch = session.snapshot().epoch;
        this.#records = [];
        this.#emit();
      }
    });
  }
  snapshot = () => this.#records;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  #emit() {
    for (const listener of this.#listeners) listener();
  }
  #set(id: number, change: Partial<CommandRecord>) {
    this.#records = this.#records.map((row) =>
      row.id === id ? Object.freeze({ ...row, ...change }) : row,
    );
    this.#emit();
  }
  review(command: Command, context: CommandContext = {}) {
    if (!isCommand(command))
      throw new Error('This decision cannot be verified.');
    if (this.session.snapshot().phase !== 'ready' || !this.allowed(command))
      throw new Error('Manager commands are unavailable.');
    const previous = this.#records.find(
      (row) => row.command.intent === command.intent,
    );
    if (previous) return previous.id;
    if (
      this.#records.some(
        (row) =>
          row.command.path === command.path &&
          row.command.target === command.target &&
          ['uncertain', 'submitting', 'review'].includes(row.phase),
      )
    )
      throw new Error(
        'A decision for this resource is already retained. Resolve or close its review before changing the command.',
      );
    if (this.#records.length >= 50)
      throw new Error('Review retained commands before preparing more.');
    const row: CommandRecord = Object.freeze({
      id: ++this.#next,
      command,
      context: Object.freeze({ ...context }),
      createdAt: Date.now(),
      phase: 'review',
    });
    this.#records = [...this.#records, row];
    this.#emit();
    return row.id;
  }
  dismiss(id: number) {
    const row = this.#records.find((row) => row.id === id);
    // Uncertain commands must retain their identity until logout. Never silently discard them.
    if (!row || ['submitting', 'uncertain', 'accepted'].includes(row.phase))
      return;
    this.#records = this.#records.filter((row) => row.id !== id);
    this.#emit();
  }
  async submit(id: number, confirmed: boolean) {
    const row = this.#records.find((row) => row.id === id);
    if (
      !confirmed ||
      !row ||
      !['review', 'uncertain', 'conflict'].includes(row.phase) ||
      !this.allowed(row.command)
    )
      return;
    if (
      row.phase === 'conflict' &&
      !['COMMAND_IN_PROGRESS', 'RETRYABLE_TRANSACTION_CONFLICT'].includes(
        row.code ?? '',
      )
    )
      return;
    if (Date.now() - row.createdAt > 15 * 60 * 1000) {
      this.#set(id, {
        message:
          'The local retry window has ended. Read current state; do not create a replacement identity for an uncertain decision.',
      });
      return;
    }
    const epoch = this.#epoch;
    this.#set(id, { phase: 'submitting', message: undefined });
    try {
      const result = await this.session.execute(row.command);
      if (epoch !== this.#epoch) return;
      this.#set(id, {
        phase: row.command.expectedStatus === 202 ? 'accepted' : 'completed',
        result,
      });
    } catch (error) {
      if (epoch !== this.#epoch) return;
      const controlled =
        error instanceof CommandError ? error : new CommandError('uncertain');
      this.#set(id, {
        phase: controlled.kind,
        message: controlled.message,
        code: controlled.code,
      });
    }
    if (epoch === this.#epoch) {
      await this.refresh(row.command, row.context);
    }
  }
  dispose() {
    this.#unsubscribe();
    this.#records = [];
    this.#listeners.clear();
  }
}
