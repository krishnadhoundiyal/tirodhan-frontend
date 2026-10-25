import { principal, type Principal } from '../api/contracts';
import { isManagerRead } from '../api/reads';
import {
  CommandError,
  conflictCode,
  isCommand,
  type Command,
} from '../api/commands';
import { integer, object, text, uuid } from '../api/schema';

export interface WebSessionAdapter {
  readonly available: boolean;
  startOtp(
    body: { client_request_id: string; phone: string },
    signal: AbortSignal,
  ): Promise<unknown>;
  verifyOtp(
    body: {
      client_login_id: string;
      challenge_reference: string;
      code: string;
    },
    signal: AbortSignal,
  ): Promise<unknown>;
  refresh(signal: AbortSignal): Promise<unknown>;
  logout(signal: AbortSignal): Promise<void>;
}
export const unavailableAdapter: WebSessionAdapter = {
  available: false,
  startOtp: async () => {
    throw new Error('Web authentication is unavailable.');
  },
  verifyOtp: async () => {
    throw new Error('Web authentication is unavailable.');
  },
  refresh: async () => {
    throw new Error('Web authentication is unavailable.');
  },
  logout: async () => {},
};
export class ReadError extends Error {
  constructor(
    public readonly kind:
      | 'unauthorized'
      | 'forbidden'
      | 'unavailable'
      | 'notFound'
      | 'invalid'
      | 'cancelled',
  ) {
    super(
      {
        unauthorized: 'Sign in again to continue.',
        forbidden: 'Manager access is no longer available.',
        unavailable: 'The service is unavailable. Try a manual refresh.',
        notFound: 'This resource is unavailable or its API is not enabled.',
        invalid: 'The service response could not be verified.',
        cancelled: 'This read no longer belongs to the current session.',
      }[kind],
    );
  }
}
type Phase =
  | 'unavailable'
  | 'signedOut'
  | 'authenticating'
  | 'checking'
  | 'ready'
  | 'denied'
  | 'error';
export interface SessionSnapshot {
  phase: Phase;
  epoch: number;
  principal: Principal | null;
  message: string;
  logoutUnconfirmed: boolean;
}
const accessToken = (value: unknown): string => {
  if (typeof value !== 'string' || !value.length || value.length > 16000)
    throw new ReadError('invalid');
  return value;
};
const decodeGrant = object({
  access_token: accessToken,
  token_type: text,
  expires_in: integer,
  user_id: uuid,
});
function grant(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    Object.keys(value).some(
      (key) =>
        !['access_token', 'token_type', 'expires_in', 'user_id'].includes(key),
    )
  )
    throw new ReadError('invalid');
  const result = decodeGrant(value);
  if (result.token_type.toLowerCase() !== 'bearer' || result.expires_in <= 0)
    throw new ReadError('invalid');
  return result;
}

/** APIM contract interface only. No browser HTTP auth adapter exists in this increment. */
export class ManagerSession {
  #token: string | null = null;
  #expiresAt = 0;
  #listeners = new Set<() => void>();
  #life = new AbortController();
  #refresh: Promise<void> | null = null;
  #logout: Promise<void> | null = null;
  #snapshot: SessionSnapshot;
  readonly origin: string | null;
  constructor(
    readonly adapter: WebSessionAdapter,
    origin: string | null,
    readonly fetcher: typeof fetch,
    private timeoutMs = 15000,
  ) {
    if (origin !== null) {
      const url = new URL(origin);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.origin !== origin
      )
        throw new Error('An exact HTTPS gateway origin is required.');
    }
    this.origin = origin;
    this.#snapshot = {
      phase: adapter.available && origin ? 'signedOut' : 'unavailable',
      epoch: 0,
      principal: null,
      message: '',
      logoutUnconfirmed: false,
    };
  }
  snapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  #emit(change: Partial<SessionSnapshot>) {
    this.#snapshot = { ...this.#snapshot, ...change };
    for (const listener of this.#listeners) listener();
  }
  #clear(phase: Phase, message = '') {
    this.#life.abort();
    this.#life = new AbortController();
    this.#token = null;
    this.#expiresAt = 0;
    this.#refresh = null;
    this.#emit({
      phase,
      epoch: this.#snapshot.epoch + 1,
      principal: null,
      message,
    });
  }
  #current(epoch: number) {
    if (epoch !== this.#snapshot.epoch) throw new ReadError('cancelled');
  }
  #available() {
    if (!this.adapter.available || !this.origin)
      throw new ReadError('unavailable');
    if (this.#logout || this.#snapshot.logoutUnconfirmed)
      throw new ReadError('unauthorized');
  }
  async #bounded<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    external?: AbortSignal,
  ): Promise<T> {
    const life = this.#life.signal;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let cancel: () => void = () => {};
    const deadline = new Promise<never>((_, reject) => {
      cancel = () => {
        controller.abort();
        reject(new ReadError('cancelled'));
      };
      timer = setTimeout(() => {
        controller.abort();
        reject(new ReadError('unavailable'));
      }, this.timeoutMs);
      life.addEventListener('abort', cancel, { once: true });
      external?.addEventListener('abort', cancel, { once: true });
      if (life.aborted || external?.aborted) cancel();
    });
    try {
      return await Promise.race([
        deadline,
        Promise.resolve().then(() => {
          if (controller.signal.aborted) throw new ReadError('cancelled');
          return operation(controller.signal);
        }),
      ]);
    } catch (error) {
      throw error instanceof ReadError ? error : new ReadError('unavailable');
    } finally {
      clearTimeout(timer!);
      life.removeEventListener('abort', cancel);
      external?.removeEventListener('abort', cancel);
    }
  }
  async #http(
    path: string,
    token: string,
    external?: AbortSignal,
    command?: Command,
  ) {
    const epoch = this.#snapshot.epoch;
    const result = await this.#bounded(async (signal) => {
      const response = await this.fetcher(this.origin + path, {
        method: command ? 'POST' : 'GET',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(command ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(command ? { body: command.payload } : {}),
        signal,
      });
      return {
        status: response.status,
        body:
          response.ok || (command && response.status === 409)
            ? ((await response.json()) as unknown)
            : null,
      };
    }, external);
    this.#current(epoch);
    return result;
  }
  async #admit(raw: unknown, epoch: number, owner?: string) {
    this.#current(epoch);
    const value = grant(raw);
    if (owner && value.user_id !== owner) throw new ReadError('unauthorized');
    const result = await this.#http('/v1/auth/me', value.access_token);
    if (result.status === 403) throw new ReadError('forbidden');
    if (result.status === 401) throw new ReadError('unauthorized');
    if (result.status !== 200) throw new ReadError('unavailable');
    const who = principal(result.body);
    if (who.user_id !== value.user_id) throw new ReadError('unauthorized');
    if (!who.roles.includes('MANAGER')) throw new ReadError('forbidden');
    this.#current(epoch);
    this.#token = value.access_token;
    this.#expiresAt = Date.now() + value.expires_in * 1000;
    this.#emit({ phase: 'ready', principal: who, message: '' });
  }
  #authFailure(error: unknown, epoch: number) {
    if (this.#snapshot.epoch !== epoch) return;
    const denied = error instanceof ReadError && error.kind === 'forbidden';
    this.#clear(
      denied ? 'denied' : 'error',
      denied
        ? 'A current MANAGER role is required.'
        : 'The web session could not be verified. Please try again.',
    );
  }
  async restore() {
    if (this.#snapshot.phase === 'unavailable') return;
    this.#available();
    this.#clear('checking');
    const epoch = this.#snapshot.epoch;
    try {
      await this.#admit(
        await this.#bounded((signal) => this.adapter.refresh(signal)),
        epoch,
      );
    } catch (error) {
      this.#authFailure(error, epoch);
    }
  }
  async startOtp(body: {
    client_request_id: string;
    phone: string;
  }): Promise<string> {
    this.#available();
    this.#clear('authenticating');
    const epoch = this.#snapshot.epoch;
    try {
      const result = object({ challenge_reference: uuid })(
        await this.#bounded((signal) => this.adapter.startOtp(body, signal)),
      );
      this.#current(epoch);
      this.#emit({ phase: 'signedOut', message: '' });
      return result.challenge_reference;
    } catch (error) {
      this.#authFailure(error, epoch);
      throw new ReadError('unavailable');
    }
  }
  async verifyOtp(body: {
    client_login_id: string;
    challenge_reference: string;
    code: string;
  }) {
    this.#available();
    const epoch = this.#snapshot.epoch;
    this.#emit({ phase: 'checking' });
    try {
      await this.#admit(
        await this.#bounded((signal) => this.adapter.verifyOtp(body, signal)),
        epoch,
      );
      return true;
    } catch (error) {
      this.#authFailure(error, epoch);
      return false;
    }
  }
  async #coordinateRefresh(epoch: number, owner: string, signal?: AbortSignal) {
    if (!this.#refresh) {
      const pending = (async () => {
        try {
          await this.#admit(
            await this.#bounded((signal) => this.adapter.refresh(signal)),
            epoch,
            owner,
          );
        } catch (error) {
          this.#authFailure(error, epoch);
          throw error;
        }
      })();
      this.#refresh = pending;
      void pending
        .finally(() => {
          if (this.#refresh === pending) this.#refresh = null;
        })
        .catch(() => {});
    }
    const shared = this.#refresh;
    await this.#bounded(() => shared, signal);
  }
  async read(path: string, signal?: AbortSignal): Promise<unknown> {
    if (!isManagerRead(path)) throw new ReadError('forbidden');
    const result = await this.#authorized(path, signal);
    if (result.status === 404) throw new ReadError('notFound');
    if (result.status !== 200) throw new ReadError('unavailable');
    return result.body;
  }
  async execute(command: Command, signal?: AbortSignal) {
    if (!isCommand(command)) throw new ReadError('forbidden');
    try {
      const result = await this.#authorized(command.path, signal, command);
      if (result.status === 409)
        throw new CommandError('conflict', conflictCode(result.body));
      if (result.status === 404 || result.status === 422)
        throw new CommandError('rejected');
      if (result.status !== command.expectedStatus)
        throw new CommandError('uncertain');
      try {
        return command.parse(result.body);
      } catch {
        throw new CommandError('uncertain');
      }
    } catch (error) {
      if (error instanceof CommandError) throw error;
      if (
        error instanceof ReadError &&
        ['forbidden', 'unauthorized', 'cancelled'].includes(error.kind)
      )
        throw error;
      throw new CommandError('uncertain');
    }
  }
  async #authorized(path: string, signal?: AbortSignal, command?: Command) {
    this.#available();
    if (
      this.#snapshot.phase !== 'ready' ||
      !this.#token ||
      !this.#snapshot.principal
    )
      throw new ReadError('unauthorized');
    const epoch = this.#snapshot.epoch,
      owner = this.#snapshot.principal.user_id;
    let refreshed = false;
    if (Date.now() >= this.#expiresAt) {
      await this.#coordinateRefresh(epoch, owner, signal);
      refreshed = true;
    }
    this.#current(epoch);
    const token = this.#token!;
    let result = await this.#http(path, token, signal, command);
    if (result.status === 401 && !refreshed) {
      if (this.#token === token)
        await this.#coordinateRefresh(epoch, owner, signal);
      this.#current(epoch);
      result = await this.#http(path, this.#token!, signal, command);
    }
    if (result.status === 401 || result.status === 403) {
      this.#clear(
        result.status === 403 ? 'denied' : 'signedOut',
        result.status === 403
          ? 'Manager access is no longer available.'
          : 'Sign in again to continue.',
      );
      throw new ReadError(result.status === 403 ? 'forbidden' : 'unauthorized');
    }
    this.#current(epoch);
    return result;
  }
  async logout() {
    if (this.#logout) return this.#logout;
    this.#clear('signedOut');
    this.#emit({
      logoutUnconfirmed: true,
      message: 'Clearing the gateway session…',
    });
    const epoch = this.#snapshot.epoch;
    const pending = (async () => {
      try {
        if (this.adapter.available)
          await this.#bounded((signal) => this.adapter.logout(signal));
        this.#current(epoch);
        this.#emit({
          logoutUnconfirmed: false,
          message: 'Signed out. Operational data has been cleared.',
        });
      } catch {
        if (this.#snapshot.epoch === epoch)
          this.#emit({
            message:
              'Local data cleared. Gateway sign-out was not confirmed; retry sign-out before signing in.',
          });
      }
    })();
    this.#logout = pending;
    try {
      await pending;
    } finally {
      if (this.#logout === pending) this.#logout = null;
    }
  }
}
