import type { AccessTokenResponse, LoginTokenResponse } from '../api/contracts';
import { ApiError } from '../api/errors';

export interface SecureCredential {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
}
export interface Principal {
  userId: string;
  roles: readonly string[];
}
export interface PrincipalReader {
  read(signal?: AbortSignal): Promise<Principal>;
}
export type SessionSnapshot = {
  status: 'starting' | 'signedOut' | 'authenticated';
  userId: string | null;
  principal: Principal | null;
  principalState: 'idle' | 'loading' | 'available' | 'unavailable';
  principalError: unknown | null;
  ownerVersion: number;
};
export class SessionStore {
  private token: string | null = null;
  private expiresAt = 0;
  private generation = 0;
  private flight: Promise<void> | null = null;
  private principalFlight: Promise<void> | null = null;
  private principalAbort: AbortController | null = null;
  private secureWrite: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  private snapshot: SessionSnapshot = {
    status: 'starting',
    userId: null,
    principal: null,
    principalState: 'idle',
    principalError: null,
    ownerVersion: 0,
  };
  constructor(
    private readonly secure: SecureCredential,
    private readonly refreshRequest: (
      credential: string,
    ) => Promise<AccessTokenResponse>,
    private readonly onClear: () => void,
    private readonly principalReader?: PrincipalReader,
  ) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  accessToken = () => this.token;
  private publish(next: SessionSnapshot) {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }
  private apply(result: AccessTokenResponse) {
    const sameUser = this.snapshot.userId === result.user_id;
    if (this.snapshot.userId && !sameUser) this.onClear();
    this.token = result.access_token;
    this.expiresAt = Date.now() + result.expires_in * 1000;
    this.publish({
      status: 'authenticated',
      userId: result.user_id,
      principal: sameUser ? this.snapshot.principal : null,
      principalState: sameUser ? this.snapshot.principalState : 'idle',
      principalError: null,
      ownerVersion: this.snapshot.ownerVersion + (sameUser ? 0 : 1),
    });
  }
  async establish(result: LoginTokenResponse) {
    const generation = ++this.generation;
    this.principalAbort?.abort();
    this.principalFlight = null;
    const write = this.secureWrite
      .catch(() => {})
      .then(async () => {
        if (generation === this.generation)
          await this.secure.set(result.refresh_token);
      });
    this.secureWrite = write;
    await write;
    if (generation !== this.generation) return;
    this.apply(result);
    await this.loadPrincipal();
  }
  loadPrincipal = (): Promise<void> => {
    if (!this.token) return Promise.resolve();
    if (this.principalFlight) return this.principalFlight;
    const generation = this.generation;
    const controller = new AbortController();
    this.principalAbort = controller;
    this.publish({
      ...this.snapshot,
      principal: null,
      principalState: 'loading',
      principalError: null,
    });
    const flight = (async () => {
      try {
        if (!this.principalReader) throw new ApiError(0, 'backendPending');
        const principal = await this.principalReader.read(controller.signal);
        if (
          generation !== this.generation ||
          controller.signal.aborted ||
          !this.token
        )
          return;
        if (
          principal.userId !== this.snapshot.userId ||
          !Array.isArray(principal.roles) ||
          !principal.roles.every((role) => typeof role === 'string')
        )
          throw new ApiError(200, 'protocol');
        this.publish({
          ...this.snapshot,
          principal,
          principalState: 'available',
          principalError: null,
        });
      } catch (error) {
        if (generation !== this.generation || controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401)
          await this.clear();
        else
          this.publish({
            ...this.snapshot,
            principal: null,
            principalState: 'unavailable',
            principalError: error,
          });
      }
    })();
    this.principalFlight = flight;
    void flight.finally(() => {
      if (this.principalFlight === flight) {
        this.principalFlight = null;
        this.principalAbort = null;
      }
    });
    return flight;
  };
  async bootstrap() {
    try {
      await this.refresh();
    } catch {
      /* refresh already clears local session */
    }
  }
  refresh = (): Promise<void> => {
    if (this.flight) return this.flight;
    const generation = this.generation;
    this.flight = (async () => {
      try {
        await this.secureWrite.catch(() => {});
        const credential = await this.secure.get();
        if (!credential) throw new Error('No credential');
        const result = await this.refreshRequest(credential);
        if (generation !== this.generation) return;
        this.apply(result);
        await this.loadPrincipal();
      } catch {
        if (generation === this.generation) await this.clear();
        throw new Error('Session renewal failed');
      } finally {
        this.flight = null;
      }
    })();
    return this.flight;
  };
  async renewIfExpired() {
    if (this.token && Date.now() >= this.expiresAt) await this.refresh();
  }
  clear = async () => {
    ++this.generation;
    this.principalAbort?.abort();
    this.principalFlight = null;
    this.token = null;
    this.expiresAt = 0;
    this.publish({
      status: 'signedOut',
      userId: null,
      principal: null,
      principalState: 'idle',
      principalError: null,
      ownerVersion: this.snapshot.ownerVersion + 1,
    });
    this.onClear();
    const removal = this.secureWrite
      .catch(() => {})
      .then(() => this.secure.remove());
    this.secureWrite = removal;
    await removal;
  };
}
