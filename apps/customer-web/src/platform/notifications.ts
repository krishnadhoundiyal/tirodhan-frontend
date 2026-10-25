import { ApiError } from '../parity/api/errors';
import { uuid } from '../parity/api/slot-contracts';
export interface WebPushPort {
  available: boolean;
  register(
    subscription: PushSubscriptionJSON,
    signal: AbortSignal,
  ): Promise<void>;
  revoke(signal: AbortSignal): Promise<void>;
}
export function signalPayload(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  return v.schema_version === 1 &&
    v.target === 'COLLECTION' &&
    typeof v.event_id === 'string' &&
    /^[A-Za-z0-9_-]{1,100}$/.test(v.event_id) &&
    uuid(v.request_id)
    ? { eventId: v.event_id, requestId: v.request_id }
    : null;
}
export class BrowserNotifications {
  #generation = 0;
  #seen = new Map<string, number>();
  #registration: ServiceWorkerRegistration | null = null;
  constructor(
    private push: WebPushPort | null,
    private key: Uint8Array<ArrayBuffer> | null,
    private current: () => boolean,
  ) {}
  async enable(
    registration: ServiceWorkerRegistration,
    notifications: typeof Notification,
    signal: AbortSignal,
  ) {
    if (!this.push?.available || !this.key || !this.current())
      throw new ApiError(0, 'backendPending');
    const generation = this.#generation;
    const permission = await notifications.requestPermission();
    if (permission !== 'granted') return permission;
    if (generation !== this.#generation || !this.current() || signal.aborted)
      throw new ApiError(0, 'cancelled');
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.key,
      }));
    if (generation !== this.#generation || !this.current() || signal.aborted) {
      await subscription.unsubscribe();
      throw new ApiError(0, 'cancelled');
    }
    try {
      await this.push.register(subscription.toJSON(), signal);
    } catch (error) {
      await subscription.unsubscribe();
      throw error;
    }
    if (generation !== this.#generation || !this.current()) {
      await subscription.unsubscribe();
      throw new ApiError(0, 'cancelled');
    }
    this.#registration = registration;
    return permission;
  }
  signal(
    raw: unknown,
    tapped: boolean,
    refetch: (id?: string) => void,
    navigate: (path: string) => void,
  ) {
    if (!this.current()) return;
    const p = signalPayload(raw);
    refetch(p?.requestId);
    if (!tapped) return;
    const now = Date.now();
    for (const [k, t] of this.#seen) if (now - t > 600000) this.#seen.delete(k);
    if (p && this.#seen.has(p.eventId)) return;
    if (p) {
      if (this.#seen.size >= 100)
        this.#seen.delete(this.#seen.keys().next().value!);
      this.#seen.set(p.eventId, now);
    }
    navigate(p ? `/account/collections/${p.requestId}` : '/account/activity');
  }
  async revoke(signal: AbortSignal) {
    ++this.#generation;
    try {
      await this.push?.revoke(signal);
    } finally {
      const subscription =
        await this.#registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
      this.#registration = null;
      this.#seen.clear();
    }
  }
  clear() {
    ++this.#generation;
    this.#seen.clear();
    // Stop delivery locally on any admission change; keep the handle until explicit revoke.
    void this.#registration?.pushManager
      .getSubscription()
      .then((s) => s?.unsubscribe())
      .catch(() => {});
  }
}
