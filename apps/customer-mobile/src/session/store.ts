import type { AccessTokenResponse, LoginTokenResponse } from '../api/contracts';

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
};
export class SessionStore {
  private token: string | null = null;
  private expiresAt = 0;
  private generation = 0;
  private flight: Promise<void> | null = null;
  private secureWrite: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  private snapshot: SessionSnapshot = {
    status: 'starting',
    userId: null,
    principal: null,
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
    this.token = result.access_token;
    this.expiresAt = Date.now() + result.expires_in * 1000;
    this.publish({
      status: 'authenticated',
      userId: result.user_id,
      principal:
        this.snapshot.userId === result.user_id
          ? this.snapshot.principal
          : null,
    });
  }
  async establish(result: LoginTokenResponse) {
    const generation = ++this.generation;
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
  async loadPrincipal() {
    if (!this.principalReader || !this.token) return;
    const generation = this.generation;
    const principal = await this.principalReader.read();
    if (generation === this.generation && this.token)
      this.publish({ ...this.snapshot, principal });
  }
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
    this.token = null;
    this.expiresAt = 0;
    this.publish({ status: 'signedOut', userId: null, principal: null });
    this.onClear();
    const removal = this.secureWrite
      .catch(() => {})
      .then(() => this.secure.remove());
    this.secureWrite = removal;
    await removal;
  };
}
