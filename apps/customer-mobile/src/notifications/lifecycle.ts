import type {
  PushRegistration,
  PushRegistrationResult,
} from '../api/customer-contracts';
import type { PreparedCommand } from '../api/transport';
import { ApiError } from '../api/errors';
export interface PushPort {
  registerPush(body: PushRegistration): PreparedCommand<PushRegistrationResult>;
  revokePush(id: string): PreparedCommand<void>;
}
export class PushLifecycle {
  private generation = 0;
  private registeredId: string | null = null;
  private flight: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  private status:
    'idle' | 'pending' | 'registered' | 'backendPending' | 'failed' = 'idle';
  constructor(
    private readonly api: PushPort,
    private readonly deviceId: () => Promise<string>,
    private readonly owner: () => string | null,
  ) {}
  state = () => this.status;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(status: typeof this.status) {
    this.status = status;
    this.listeners.forEach((listener) => listener());
  }
  register(platform: 'ANDROID' | 'IOS', token: string): Promise<void> {
    const generation = this.generation,
      owner = this.owner();
    if (!owner || !token) return Promise.resolve();
    this.publish('pending');
    const operation = this.flight
      .catch(() => {})
      .then(async () => {
        if (generation !== this.generation || owner !== this.owner()) return;
        try {
          const id = await this.deviceId();
          if (generation !== this.generation || owner !== this.owner()) return;
          await this.api
            .registerPush({
              client_device_id: id,
              platform,
              token_provider: platform === 'ANDROID' ? 'FCM' : 'APNS',
              token,
            })
            .execute();
          if (generation === this.generation && owner === this.owner()) {
            this.registeredId = id;
            this.publish('registered');
          }
        } catch (error) {
          if (generation === this.generation)
            this.publish(
              error instanceof ApiError && error.kind === 'backendPending'
                ? 'backendPending'
                : 'failed',
            );
        }
      });
    this.flight = operation;
    return operation;
  }
  async revoke() {
    ++this.generation;
    await this.flight.catch(() => {});
    const id = this.registeredId ?? (await this.deviceId());
    try {
      await this.api.revokePush(id).execute();
    } finally {
      this.clear();
    }
  }
  clear() {
    ++this.generation;
    this.registeredId = null;
    this.publish('idle');
  }
}
