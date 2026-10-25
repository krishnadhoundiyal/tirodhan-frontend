import { CustomerSession } from '../auth/session';
import { createApi } from '../parity/api/client';
import { createCustomerApi } from '../parity/api/customer-client';
import { Transport, type PreparedCommand } from '../parity/api/transport';
import {
  capabilityGate,
  type CustomerCapability,
} from '../parity/api/capabilities';
import { createHttpRepositories } from '../parity/features/collection/repository';
import { BookingFlow } from '../parity/features/collection/bookingFlow';
import { BookingRecoveryStore } from '../parity/features/collection/bookingRecovery';
import type { ItemDeclaration } from '../parity/features/collection/declarations';
import { addressIdentity } from '../parity/features/addresses/distance';
import type { Address, Context, Location } from '../api/contracts';
import {
  EncryptedRecovery,
  browserRecovery,
  memoryStorage,
} from '../platform/recovery';
import type { SecureCredential } from '../parity/session/store';
import type { CheckoutPort } from '../platform/checkout';
import type { Geocoder, MapConfiguration } from '../platform/location';
import {
  BrowserNotifications,
  type WebPushPort,
} from '../platform/notifications';
import { PaymentFlow } from './payment';
import { ApiError, ambiguousCommand } from '../parity/api/errors';
import type { PaymentAttempt } from '../parity/api/contracts';
export const verifiedCapabilities: CustomerCapability[] = [
  'principal',
  'catalogue',
  'slots',
  'weightPricing',
  'collections',
  'recommendations',
  'payment',
  'checkout',
  'refunds',
  'cancellationCompensation',
];
export interface ExperienceOptions {
  capabilities?: ReadonlySet<string>;
  checkout?: CheckoutPort | null;
  memoryRecovery?: boolean;
  geocoder?: Geocoder | null;
  map?: MapConfiguration | null;
  push?: WebPushPort | null;
  vapidKey?: Uint8Array<ArrayBuffer> | null;
  mediaResolver?: (
    media: import('../parity/api/customer-contracts').MediaDto,
  ) => string | null;
}
export interface DraftState {
  version: number;
  address: Address | null;
  context: Context | null;
  codes: string[];
  declarations: Record<string, ItemDeclaration>;
  currentLocation: Location | null;
  confirmedAddress: string | null;
}
export class CustomerExperience {
  readonly repo;
  readonly booking: BookingFlow;
  readonly notifications: BrowserNotifications;
  readonly owner: string;
  readonly epoch: number;
  readonly transport: Transport;
  readonly capabilities: ReadonlySet<string>;
  #listeners = new Set<() => void>();
  #draft: DraftState = {
    version: 0,
    address: null,
    context: null,
    codes: [],
    declarations: {},
    currentLocation: null,
    confirmedAddress: null,
  };
  #vault: EncryptedRecovery | null = null;
  #storages = new Map<string, SecureCredential>();
  #payments = new Map<string, PaymentFlow>();
  #commands = new Map<
    string,
    { body: string; command: PreparedCommand<unknown>; uncertain: boolean }
  >();
  constructor(
    readonly session: CustomerSession,
    readonly options: ExperienceOptions = {},
  ) {
    const state = session.snapshot();
    if (state.phase !== 'ready' || !state.principal) throw new ApiError(401);
    this.owner = state.principal.user_id;
    this.epoch = state.epoch;
    this.capabilities = options.capabilities ?? new Set(verifiedCapabilities);
    this.transport = new Transport(session);
    const gate = capabilityGate(this.capabilities);
    this.repo = createHttpRepositories(
      createCustomerApi(this.transport, gate),
      createApi(this.transport),
      gate,
    );
    const recovery = new BookingRecoveryStore(this.storage('booking'));
    this.booking = new BookingFlow(
      this.repo,
      recovery,
      this.owner,
      () => (this.current() ? `${this.owner}:${this.epoch}` : 'signed-out'),
      () => crypto.randomUUID(),
    );
    this.notifications = new BrowserNotifications(
      options.push ?? null,
      options.vapidKey ?? null,
      () => this.current(),
    );
  }
  current = () =>
    this.session.snapshot().phase === 'ready' &&
    this.session.snapshot().epoch === this.epoch &&
    this.session.snapshot().principal?.user_id === this.owner;
  snapshot = () => this.#draft;
  subscribe = (f: () => void) => {
    this.#listeners.add(f);
    return () => {
      this.#listeners.delete(f);
    };
  };
  #publish(change: Partial<DraftState>) {
    if (!this.current()) throw new ApiError(401);
    this.#draft = {
      ...this.#draft,
      ...change,
      version: this.#draft.version + 1,
    };
    this.#listeners.forEach((f) => f());
  }
  editable() {
    this.booking.startNext();
    if (this.booking.getSnapshot() !== 'idle')
      throw new ApiError(409, 'http', 'NOT_ELIGIBLE');
  }
  selectAddress(address: Address | null) {
    this.editable();
    this.booking.setAddressBinding(addressIdentity(address));
    this.#publish({ address, context: null, confirmedAddress: null });
  }
  invalidateAddress(id: string) {
    if (this.#draft.address?.address_id === id) {
      this.booking.setAddressBinding(null);
      this.#publish({ address: null, context: null, confirmedAddress: null });
    }
  }
  checkContext(value: Context) {
    if (
      !this.#draft.address ||
      value.source_address_id !== this.#draft.address.address_id ||
      value.source_address_version !== this.#draft.address.version
    )
      throw new ApiError(200, 'protocol');
    this.#publish({ context: value });
  }
  selectCategory(code: string) {
    this.editable();
    this.#publish({
      codes: this.#draft.codes.includes(code)
        ? this.#draft.codes.filter((c) => c !== code)
        : [...this.#draft.codes, code],
    });
  }
  declare(code: string, value: ItemDeclaration) {
    this.editable();
    this.#publish({
      declarations: { ...this.#draft.declarations, [code]: value },
    });
  }
  setLocation(currentLocation: Location) {
    this.#publish({ currentLocation, confirmedAddress: null });
  }
  confirmAddress() {
    this.#publish({ confirmedAddress: addressIdentity(this.#draft.address) });
  }
  storage(kind: string): SecureCredential {
    let value = this.#storages.get(kind);
    if (value) return value;
    if (this.options.memoryRecovery) value = memoryStorage();
    else {
      this.#vault ??= browserRecovery(this.owner, () => this.current());
      if (!this.#vault)
        value = {
          get: async () => {
            throw new ApiError(0, 'configuration');
          },
          set: async () => {
            throw new ApiError(0, 'configuration');
          },
          remove: async () => {},
        };
      else {
        value = this.#vault.storage(kind);
      }
    }
    this.#storages.set(kind, value);
    return value;
  }
  payment(id: string) {
    let flow = this.#payments.get(id);
    if (!flow) {
      flow = new PaymentFlow(
        id,
        {
          payment: this.repo.payment,
          checkout: this.repo.checkout,
          prepare: (id, key) => {
            capabilityGate(this.capabilities)('payment');
            capabilityGate(this.capabilities)('checkout');
            return this.transport.command<PaymentAttempt>(
              `/v1/payments/collection-requests/${id}/attempts`,
              { method: 'POST', headers: { 'Idempotency-Key': key } },
            );
          },
        },
        this.options.checkout ?? null,
        this.storage(`payment:${id}`),
        () => this.current(),
      );
      this.#payments.set(id, flow);
    }
    return flow;
  }
  async command<T>(
    scope: string,
    body: unknown,
    prepare: () => PreparedCommand<T>,
  ): Promise<T> {
    if (!this.current()) throw new ApiError(401);
    let entry = this.#commands.get(scope);
    const signature = JSON.stringify(body);
    if (entry && entry.body !== signature)
      throw new ApiError(409, 'http', 'NOT_ELIGIBLE');
    if (!entry) {
      entry = { body: signature, command: prepare(), uncertain: false };
      this.#commands.set(scope, entry);
    }
    try {
      const result = await entry.command.execute();
      if (!this.current()) throw new ApiError(401);
      this.#commands.delete(scope);
      return result as T;
    } catch (e) {
      if (ambiguousCommand(e)) entry.uncertain = true;
      else if (
        !entry.uncertain &&
        e instanceof ApiError &&
        [403, 404, 422].includes(e.status)
      )
        this.#commands.delete(scope);
      throw e;
    }
  }
  unresolved(scope: string) {
    return this.#commands.has(scope);
  }
  submitted(scope: string): unknown {
    const entry = this.#commands.get(scope);
    return entry ? JSON.parse(entry.body) : null;
  }
  async dispose(explicitLogout: boolean) {
    this.options.checkout?.close();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const revoke = explicitLogout
      ? this.notifications.revoke(controller.signal)
      : Promise.resolve();
    const settledRevoke = revoke.then(
      () => null,
      (error) => error,
    );
    this.notifications.clear();
    this.#commands.clear();
    this.#payments.clear();
    this.#listeners.clear();
    this.#draft = {
      version: 0,
      address: null,
      context: null,
      codes: [],
      declarations: {},
      currentLocation: null,
      confirmedAddress: null,
    };
    if (this.#vault) await this.#vault.dispose(explicitLogout);
    else if (explicitLogout)
      await Promise.all([...this.#storages.values()].map((s) => s.remove()));
    const revokeError = await settledRevoke;
    clearTimeout(timer);
    if (revokeError) throw revokeError;
  }
}
