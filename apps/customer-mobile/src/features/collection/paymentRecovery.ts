import type { SecureCredential } from '../../session/store';
import { ApiError } from '../../api/errors';
import { paymentText } from '../../api/payment-contracts';
import { uuid } from '../../api/slot-contracts';

export interface PaymentRecovery {
  requestId: string;
  commandKey: string;
  attemptId: string | null;
  orderId: string | null;
  rejectedFirstAttempt?: boolean;
}
type Record = { version: 1; owner: string; commands: PaymentRecovery[] };
// Only command/Order identities, never checkout permission, credentials or SDK payloads.
export class PaymentRecoveryStore {
  private writes: Promise<unknown> = Promise.resolve();
  constructor(private readonly storage: SecureCredential) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.writes.catch(() => {}).then(work);
    this.writes = next;
    return next;
  }
  private async load(): Promise<Record | null> {
    const raw = await this.storage.get();
    if (!raw) return null;
    let value: Record;
    try {
      value = JSON.parse(raw) as Record;
    } catch {
      throw new ApiError(200, 'protocol');
    }
    if (
      value?.version !== 1 ||
      !paymentText(value.owner) ||
      !Array.isArray(value.commands) ||
      value.commands.length > 100 ||
      value.commands.some(
        (c) =>
          !c ||
          !paymentText(c.requestId) ||
          !uuid(c.commandKey) ||
          !(c.attemptId === null || paymentText(c.attemptId)) ||
          !(
            c.rejectedFirstAttempt === undefined ||
            typeof c.rejectedFirstAttempt === 'boolean'
          ) ||
          (c.rejectedFirstAttempt === true &&
            (c.orderId !== null || c.attemptId === null)) ||
          !(
            c.orderId === null ||
            (typeof c.orderId === 'string' &&
              /^order_[A-Za-z0-9]{1,190}$/.test(c.orderId))
          ),
      ) ||
      new Set(value.commands.map((c) => c.requestId)).size !==
        value.commands.length
    )
      throw new ApiError(200, 'protocol');
    return value;
  }
  prepare(
    owner: string,
    requestId: string,
    newId: () => string,
    assertCurrent: () => void,
  ): Promise<PaymentRecovery> {
    return this.serial(async () => {
      assertCurrent();
      const stored = await this.load();
      assertCurrent();
      const record: Record =
        stored?.owner === owner ? stored : { version: 1, owner, commands: [] };
      const existing = record.commands.find((c) => c.requestId === requestId);
      if (existing && !existing.rejectedFirstAttempt) return { ...existing };
      if (!existing && record.commands.length >= 100)
        throw new ApiError(0, 'configuration');
      const command: PaymentRecovery = {
        requestId,
        commandKey: newId(),
        attemptId: null,
        orderId: null,
      };
      if (
        !paymentText(owner) ||
        !paymentText(requestId) ||
        !uuid(command.commandKey) ||
        command.commandKey === existing?.commandKey
      )
        throw new ApiError(0, 'configuration');
      // Only a positive backend rejection of the never-exposed first Order permits
      // a new command, and only on the next explicit customer start() call.
      if (existing)
        record.commands[record.commands.indexOf(existing)] = command;
      else record.commands.push(command);
      await this.storage.set(JSON.stringify(record));
      assertCurrent();
      return { ...command };
    });
  }
  bind(
    owner: string,
    command: PaymentRecovery,
    attemptId: string,
    orderId: string | null,
    assertCurrent: () => void,
    rejectedFirstAttempt = false,
  ) {
    return this.serial(async () => {
      assertCurrent();
      const record = await this.load();
      assertCurrent();
      const current =
        record?.owner === owner
          ? record.commands.find((c) => c.requestId === command.requestId)
          : null;
      if (
        !current ||
        current.commandKey !== command.commandKey ||
        !paymentText(attemptId) ||
        (current.attemptId && current.attemptId !== attemptId) ||
        (current.orderId && orderId !== current.orderId) ||
        (orderId !== null && !/^order_[A-Za-z0-9]{1,190}$/.test(orderId)) ||
        (rejectedFirstAttempt && orderId !== null)
      )
        throw new ApiError(200, 'protocol');
      current.attemptId = attemptId;
      current.orderId = orderId;
      if (rejectedFirstAttempt) current.rejectedFirstAttempt = true;
      await this.storage.set(JSON.stringify(record));
      assertCurrent();
      return { ...current };
    });
  }
  resolve(owner: string, requestId: string, assertCurrent: () => void) {
    return this.serial(async () => {
      assertCurrent();
      const record = await this.load();
      assertCurrent();
      if (
        record?.owner !== owner ||
        !record.commands.some((c) => c.requestId === requestId)
      )
        return;
      record.commands = record.commands.filter(
        (c) => c.requestId !== requestId,
      );
      if (record.commands.length)
        await this.storage.set(JSON.stringify(record));
      else await this.storage.remove();
    });
  }
  clear() {
    return this.serial(() => this.storage.remove());
  }
}
