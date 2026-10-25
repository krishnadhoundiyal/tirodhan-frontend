import { customerPathAllowed } from '../api/paths';
import { safeErrorCode } from '../parity/api/errors';
import {
  CustomerError,
  grant,
  principal,
  record,
  uuid,
  type Grant,
  type Principal,
} from '../api/contracts';

/** APIM must strip refresh credentials before any response reaches JavaScript.
 * Concrete cookie routes/origins and real acceptance remain unapproved (#13/#14).
 * Implementations must serialize cookie operations across tabs and handle ambiguous verify/logout. */
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
    throw new CustomerError('unavailable');
  },
  verifyOtp: async () => {
    throw new CustomerError('unavailable');
  },
  refresh: async () => {
    throw new CustomerError('unavailable');
  },
  logout: async () => {},
};
export type Phase =
  'unavailable' | 'signedOut' | 'checking' | 'ready' | 'denied' | 'error';
export interface SessionState {
  phase: Phase;
  epoch: number;
  principal: Principal | null;
  logoutUnconfirmed: boolean;
}
export class CustomerSession {
  #token: string | null = null;
  #expiresAt = 0;
  #grantRevision = 0;
  #state: SessionState;
  #listeners = new Set<() => void>();
  #life = new AbortController();
  #refresh: Promise<void> | null = null;
  #logout: Promise<void> | null = null;
  #cleanup = new Set<() => Promise<void>>();
  #otpStart: { phone: string; client_request_id: string } | null = null;
  #startFlight: Promise<string> | null = null;
  beforeLogout(fn: () => Promise<void>) {
    this.#cleanup.add(fn);
    return () => {
      this.#cleanup.delete(fn);
    };
  }
  constructor(
    readonly adapter: WebSessionAdapter,
    private origin: string | null,
    private fetcher: typeof fetch,
    private timeoutMs = 15000,
  ) {
    if (origin !== null) {
      const u = new URL(origin);
      if (
        u.protocol !== 'https:' ||
        u.origin !== origin ||
        u.username ||
        u.password
      )
        throw new CustomerError('invalid');
    }
    this.#state = {
      phase: origin && adapter.available ? 'signedOut' : 'unavailable',
      epoch: 0,
      principal: null,
      logoutUnconfirmed: false,
    };
  }
  snapshot = () => this.#state;
  subscribe = (fn: () => void) => {
    this.#listeners.add(fn);
    return () => {
      this.#listeners.delete(fn);
    };
  };
  #emit(change: Partial<SessionState>) {
    this.#state = { ...this.#state, ...change };
    this.#listeners.forEach((fn) => fn());
  }
  #clear(phase: Phase, logoutUnconfirmed = this.#state.logoutUnconfirmed) {
    this.#life.abort();
    this.#life = new AbortController();
    this.#token = null;
    this.#expiresAt = 0;
    this.#refresh = null;
    this.#otpStart = null;
    this.#startFlight = null;
    this.#emit({
      phase,
      principal: null,
      epoch: this.#state.epoch + 1,
      logoutUnconfirmed,
    });
  }
  #current(epoch: number) {
    if (epoch !== this.#state.epoch || this.#life.signal.aborted)
      throw new CustomerError('cancelled');
  }
  async #bounded<T>(
    run: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    const signals = [this.#life.signal, ...(signal ? [signal] : [])];
    const abort = () => controller.abort();
    signals.forEach((s) => s.addEventListener('abort', abort, { once: true }));
    if (signals.some((s) => s.aborted)) controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectAbort: () => void = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      rejectAbort = () => reject(new CustomerError('cancelled'));
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
      if (controller.signal.aborted) rejectAbort();
    });
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new CustomerError('unavailable'));
        controller.abort();
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([
        Promise.resolve().then(() => {
          if (controller.signal.aborted) throw new CustomerError('cancelled');
          return run(controller.signal);
        }),
        cancelled,
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', rejectAbort);
      signals.forEach((s) => s.removeEventListener('abort', abort));
    }
  }
  #status(code: number, safeCode?: string): never {
    throw new CustomerError(
      (
        {
          401: 'unauthorized',
          403: 'forbidden',
          404: 'notFound',
          409: 'conflict',
          422: 'input',
          429: 'rateLimit',
        } as const
      )[code as 401] ?? 'unavailable',
      code,
      safeCode,
    );
  }
  async #http(
    path: string,
    init: RequestInit,
    success: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!this.origin || !this.#token) throw new CustomerError('unauthorized');
    const token = this.#token;
    return this.#bounded(async (s) => {
      const response = await this.fetcher(`${this.origin}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...init.headers,
          Authorization: `Bearer ${token}`,
        },
        signal: s,
        credentials: 'omit',
        mode: 'cors',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      });
      if (response.status !== success) {
        let safeCode: string | undefined;
        if (response.headers.get('content-type')?.includes('application/json'))
          try {
            const raw = await response.text();
            if (raw.length < 10000) safeCode = safeErrorCode(JSON.parse(raw));
          } catch {
            /* Never retain raw errors. */
          }
        this.#status(response.status, safeCode);
      }
      if (success === 204) return undefined;
      if (
        !response.headers
          .get('content-type')
          ?.toLowerCase()
          .startsWith('application/json')
      )
        throw new CustomerError('invalid');
      const body = await response.text();
      if (body.length > 2_000_000) throw new CustomerError('invalid');
      try {
        return JSON.parse(body) as unknown;
      } catch {
        throw new CustomerError('invalid');
      }
    }, signal);
  }
  async #admit(g: Grant, epoch: number, expectedOwner?: string) {
    this.#current(epoch);
    if (expectedOwner && g.user_id !== expectedOwner)
      throw new CustomerError('unauthorized');
    this.#token = g.access_token;
    this.#grantRevision++;
    this.#expiresAt = Date.now() + g.expires_in * 1000;
    const me = principal(
      await this.#http('/v1/auth/me', { method: 'GET' }, 200),
    );
    this.#current(epoch);
    if (
      me.user_id !== g.user_id ||
      (expectedOwner && me.user_id !== expectedOwner)
    )
      throw new CustomerError('unauthorized');
    if (!me.roles.includes('CUSTOMER')) throw new CustomerError('forbidden');
    this.#emit({ phase: 'ready', principal: me });
  }
  async startOtp(phone: string, resend = false) {
    if (
      this.#state.phase !== 'signedOut' ||
      this.#state.logoutUnconfirmed ||
      !/^\+[1-9]\d{7,14}$/.test(phone)
    )
      throw new CustomerError('unavailable');
    if (this.#startFlight) return this.#startFlight;
    if (resend || this.#otpStart?.phone !== phone)
      this.#otpStart = { phone, client_request_id: crypto.randomUUID() };
    const request = { ...this.#otpStart! },
      epoch = this.#state.epoch;
    const task = (async () => {
      const result = await this.#bounded((s) =>
        this.adapter.startOtp(request, s),
      );
      this.#current(epoch);
      return uuid(record(result, ['challenge_reference']).challenge_reference);
    })();
    this.#startFlight = task;
    void task
      .finally(() => {
        if (this.#startFlight === task) this.#startFlight = null;
      })
      .catch(() => {});
    return task;
  }
  async login(challenge_reference: string, code: string) {
    if (
      this.#state.phase !== 'signedOut' ||
      this.#state.logoutUnconfirmed ||
      !/^\d{4,8}$/.test(code)
    )
      throw new CustomerError('unavailable');
    uuid(challenge_reference);
    this.#clear('checking');
    const epoch = this.#state.epoch;
    try {
      await this.#admit(
        grant(
          await this.#bounded((s) =>
            this.adapter.verifyOtp(
              {
                client_login_id: crypto.randomUUID(),
                challenge_reference,
                code,
              },
              s,
            ),
          ),
        ),
        epoch,
      );
    } catch (e) {
      if (epoch === this.#state.epoch)
        this.#clear(
          e instanceof CustomerError && e.kind === 'forbidden'
            ? 'denied'
            : 'error',
          true,
        );
      throw e;
    }
  }
  async resume() {
    if (this.#state.phase !== 'signedOut' || this.#state.logoutUnconfirmed)
      throw new CustomerError('unavailable');
    this.#clear('checking');
    const epoch = this.#state.epoch;
    try {
      await this.#admit(
        grant(await this.#bounded((s) => this.adapter.refresh(s))),
        epoch,
      );
    } catch (e) {
      if (epoch === this.#state.epoch) this.#clear('error', true);
      throw e;
    }
  }
  async #renew(epoch: number) {
    this.#current(epoch);
    if (!this.#refresh) {
      const owner = this.#state.principal?.user_id;
      const pending = (async () => {
        try {
          await this.#admit(
            grant(await this.#bounded((s) => this.adapter.refresh(s))),
            epoch,
            owner,
          );
        } catch (e) {
          if (epoch === this.#state.epoch) this.#clear('error', true);
          throw e;
        }
      })();
      this.#refresh = pending;
      void pending
        .finally(() => {
          if (this.#refresh === pending) this.#refresh = null;
        })
        .catch(() => {});
    }
    await this.#refresh;
    this.#current(epoch);
  }
  async request(
    path: string,
    init: RequestInit,
    success: number,
    signal?: AbortSignal,
  ) {
    if (this.#state.phase !== 'ready') throw new CustomerError('unauthorized');
    if (!customerPathAllowed(path, init.method ?? 'GET'))
      throw new CustomerError('invalid');
    const epoch = this.#state.epoch;
    let refreshed = false;
    if (Date.now() >= this.#expiresAt) {
      await this.#renew(epoch);
      refreshed = true;
    }
    const revision = this.#grantRevision;
    try {
      const result = await this.#http(path, init, success, signal);
      this.#current(epoch);
      return result;
    } catch (e) {
      this.#current(epoch);
      if (!(e instanceof CustomerError) || e.kind !== 'unauthorized') throw e;
      if (refreshed) {
        this.#clear('error', true);
        throw e;
      }
      if (revision === this.#grantRevision) await this.#renew(epoch);
      this.#current(epoch);
      try {
        const result = await this.#http(path, init, success, signal);
        this.#current(epoch);
        return result;
      } catch (retryError) {
        if (
          epoch === this.#state.epoch &&
          retryError instanceof CustomerError &&
          retryError.kind === 'unauthorized'
        )
          this.#clear('error', true);
        throw retryError;
      }
    }
  }
  logout() {
    if (this.#logout) return this.#logout;
    this.#clear(
      this.adapter.available ? 'signedOut' : 'unavailable',
      this.adapter.available,
    );
    const epoch = this.#state.epoch;
    const pending = this.#bounded(async (s) => {
      await Promise.all([...this.#cleanup].map((fn) => fn()));
      return this.adapter.logout(s);
    }).then(() => {
      this.#current(epoch);
      this.#emit({ logoutUnconfirmed: false });
    });
    this.#logout = pending;
    void pending
      .finally(() => {
        if (this.#logout === pending) this.#logout = null;
      })
      .catch(() => {});
    return pending;
  }
}
