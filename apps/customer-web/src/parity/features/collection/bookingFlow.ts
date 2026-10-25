import type {
  CollectionCreate,
  CollectionResponse,
  ServiceabilityContext,
} from '../../api/contracts';
import { ApiError, ambiguousCommand } from '../../api/errors';
import type { PreparedCommand } from '../../api/transport';
import {
  holdBookable,
  slotSelectable,
  uuid,
  type ContextSlots,
  type ProjectedSlot,
  type SlotHold,
} from '../../api/slot-contracts';
import type { CustomerRepositories } from './repository';
import type { BookingRecovery, BookingRecoveryStore } from './bookingRecovery';
import { parseQuote, type WeightQuote } from '../../api/weight-contracts';

export type BookingStage =
  | 'idle'
  | 'holding'
  | 'held'
  | 'booking'
  | 'uncertainHold'
  | 'uncertainBooking'
  | 'restart'
  | 'complete';
export interface BookingIntent {
  context: ServiceabilityContext;
  availability: ContextSlots;
  slot: ProjectedSlot;
  items: CollectionCreate['items'];
  quote: WeightQuote | null;
}
export class PhysicalLoadRequired extends Error {
  constructor() {
    super(
      'A reviewed server quote with complete weight and volume is required before booking.',
    );
  }
}
export class BoundBooking extends Error {
  constructor(public readonly requestId: string) {
    super('This hold is already bound to a booking.');
  }
}
export class RecoveryRequired extends Error {
  constructor() {
    super('Check the previous booking before starting another.');
  }
}
// A single owner-scoped prepared operation. Capacity/pricing remain server owned.
export class BookingFlow {
  private stage: BookingStage = 'idle';
  private hold: SlotHold | null = null;
  private holdCommand: PreparedCommand<SlotHold> | null = null;
  private bookingCommand: PreparedCommand<CollectionResponse> | null = null;
  private record: BookingRecovery | null = null;
  private flight: Promise<CollectionResponse> | null = null;
  private initialized = false;
  private initialization: Promise<void> | null = null;
  private recoveryFlight: Promise<string | null> | null = null;
  private preparedBinding: string | null = null;
  private addressBinding: string | null = null;
  private listeners = new Set<() => void>();
  private readonly sessionOwner: string;
  constructor(
    private readonly repo: Pick<
      CustomerRepositories,
      'holdSlot' | 'readHold' | 'createCollection'
    >,
    private readonly recovery: BookingRecoveryStore,
    private readonly owner: string,
    private readonly currentOwner: () => string,
    private readonly newId: () => string,
    private readonly now = Date.now,
  ) {
    this.sessionOwner = currentOwner();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.stage;
  getHold = () => this.hold;
  getPreparedSummary = () =>
    this.record?.holdBody && this.record.quotedAmountMinor !== undefined
      ? {
          weight: this.record.holdBody.mass_g,
          volume: this.record.holdBody.volume_ml,
          amount: this.record.quotedAmountMinor,
        }
      : null;
  startNext() {
    if (this.stage === 'complete') this.reset();
  }
  setAddressBinding(identity: string | null) {
    this.addressBinding = identity;
  }
  ownsSession = () => this.currentOwner() === this.sessionOwner;
  private set(stage: BookingStage) {
    this.stage = stage;
    this.listeners.forEach((fn) => fn());
  }
  private assertOwner() {
    if (this.currentOwner() !== this.sessionOwner) throw new ApiError(401);
  }
  initialize(): Promise<void> {
    this.assertOwner();
    if (this.initialized) return Promise.resolve();
    if (this.initialization) return this.initialization;
    const flight = (async () => {
      const record = await this.recovery.read(this.owner);
      this.assertOwner();
      this.record = record;
      this.initialized = true;
      if (record) this.set('restart');
    })();
    this.initialization = flight;
    void flight
      .finally(() => {
        this.initialization = null;
      })
      .catch(() => {});
    return flight;
  }
  recoverRestart(): Promise<string | null> {
    this.assertOwner();
    if (this.recoveryFlight) return this.recoveryFlight;
    const flight = this.reconcile();
    this.recoveryFlight = flight;
    void flight
      .finally(() => {
        this.recoveryFlight = null;
      })
      .catch(() => {});
    return flight;
  }
  private async reconcile(): Promise<string | null> {
    await this.initialize();
    this.assertOwner();
    if (this.stage !== 'restart' || !this.record) return null;
    if (this.record.requestId) {
      this.set('complete');
      return this.record.requestId;
    }
    // The backend reservation ID is exactly client_command_id, including after response loss.
    let hold: SlotHold;
    try {
      hold = await this.repo.readHold(
        this.record.reservationId ?? this.record.holdCommandId,
      );
    } catch (error) {
      this.assertOwner();
      if (
        !(error instanceof ApiError) ||
        error.status !== 404 ||
        !this.record.holdBody
      )
        throw error;
      // A 404 can precede the first transaction's commit. Replay exactly, never a new ID.
      hold = await this.repo.holdSlot(this.record.holdBody).execute();
    }
    this.assertOwner();
    this.hold = hold;
    if (hold.bound_request_id)
      return this.rememberBinding(hold.bound_request_id);
    if (this.record.holdBody && this.record.bookingBody) {
      this.bookingBody = this.record.bookingBody;
      this.holdCommand = this.repo.holdSlot(this.record.holdBody);
      // A resumed session is for the same owner; saved API bodies retain the original context.
      this.preparedBinding = this.addressBinding;
      if (this.record.bookingSubmitted) {
        this.bookingCommand = this.repo.createCollection(this.bookingBody);
        this.set('uncertainBooking');
        try {
          return (await this.executeBooking()).request_id;
        } catch (error) {
          this.assertOwner();
          this.set('restart');
          throw error;
        }
      }
      if (holdBookable(hold, this.now())) {
        this.set('held');
        try {
          return (await this.run()).request_id;
        } catch (error) {
          if (error instanceof BoundBooking) return error.requestId;
          this.assertOwner();
          if (this.getSnapshot() !== 'idle') this.set('restart');
          throw error;
        }
      }
    } else if (this.record.bookingCommandId) throw new RecoveryRequired();
    // With no booking ever submitted, a passed cutoff resolves the old hold.
    if (
      !holdBookable(hold, this.now()) &&
      Date.parse(hold.book_by) <= this.now()
    ) {
      await this.recovery.clear();
      this.assertOwner();
      this.reset();
      return null;
    }
    throw new RecoveryRequired();
  }
  private async rememberBinding(requestId: string) {
    this.assertOwner();
    this.record = { ...this.record!, requestId };
    await this.recovery.write(this.record);
    this.assertOwner();
    this.set('complete');
    return requestId;
  }
  submit(intent?: BookingIntent): Promise<CollectionResponse> {
    this.assertOwner();
    if (this.recoveryFlight) return Promise.reject(new RecoveryRequired());
    if (this.flight) return this.flight;
    const flight = this.run(intent);
    this.flight = flight;
    void flight
      .finally(() => {
        if (this.flight === flight) this.flight = null;
      })
      .catch(() => {});
    return flight;
  }
  private async run(intent?: BookingIntent): Promise<CollectionResponse> {
    await this.initialize();
    this.assertOwner();
    if (this.stage === 'restart' || this.stage === 'complete')
      throw new RecoveryRequired();
    if (!this.holdCommand) {
      if (!intent) throw new RecoveryRequired();
      if (!intent.quote) throw new PhysicalLoadRequired();
      const { context, availability, slot, items } = intent;
      const quote = JSON.parse(
        JSON.stringify(
          parseQuote(intent.quote, { ...intent.quote.confirmation, items }),
        ),
      ) as WeightQuote;
      if (
        !quote.live_customer_holds_available ||
        quote.total_volume_ml === null
      )
        throw new PhysicalLoadRequired();
      if (
        context.status !== 'SERVICEABLE' ||
        Date.parse(context.expires_at) <= this.now() ||
        context.serviceability_context_id !==
          availability.serviceability_context_id ||
        !availability.slots.includes(slot) ||
        !slotSelectable(slot, this.now()) ||
        !items.length
      )
        throw new ApiError(409, 'http', 'SLOT_UNAVAILABLE');
      const holdId = this.newId();
      this.preparedBinding = this.addressBinding;
      const holdBody = {
        client_command_id: holdId,
        context_id: context.serviceability_context_id,
        expected_generation: slot.generation,
        slot_start: slot.slot_start,
        slot_end: slot.slot_end,
        pickup_seconds: availability.standard_pickup_seconds,
        discharge_seconds: availability.standard_discharge_seconds,
        mass_g: quote.total_weight_grams,
        volume_ml: quote.total_volume_ml,
        items: quote.items,
        confirmed_quote: quote.confirmation,
      };
      this.holdCommand = this.repo.holdSlot(holdBody);
      // Freeze the eventual booking fields now, before the hold can become ambiguous.
      this.bookingBody = JSON.parse(
        JSON.stringify({
          client_request_id: this.newId(),
          serviceability_context_id: context.serviceability_context_id,
          capacity_reservation_id: holdId,
          slot_start: slot.slot_start,
          slot_end: slot.slot_end,
          items: quote.items,
          confirmed_quote: quote.confirmation,
        }),
      ) as CollectionCreate;
      this.record = JSON.parse(
        JSON.stringify({
          owner: this.owner,
          holdCommandId: holdId,
          bookingCommandId: this.bookingBody.client_request_id,
          holdBody,
          bookingBody: this.bookingBody,
          bookingSubmitted: false,
          quotedAmountMinor: quote.total_amount_minor,
        }),
      ) as BookingRecovery;
    }
    if (this.hold?.bound_request_id)
      throw new BoundBooking(
        await this.rememberBinding(this.hold.bound_request_id),
      );
    if (!this.record || !this.bookingBody) throw new RecoveryRequired();
    // Once booking was sent, replay it even after the old hold expires or becomes bound.
    if (this.bookingCommand) return this.executeBooking();
    const wasUncertain = this.stage === 'uncertainHold';
    this.set('holding');
    try {
      await this.recovery.write(this.record);
      this.assertOwner();
      if (wasUncertain) {
        try {
          this.hold = await this.repo.readHold(this.record.holdCommandId);
        } catch (error) {
          this.assertOwner();
          if (!(error instanceof ApiError) || error.status !== 404) throw error;
          this.hold = await this.holdCommand!.execute();
        }
      } else if (!this.hold) this.hold = await this.holdCommand!.execute();
      this.assertOwner();
      this.record = {
        ...this.record,
        reservationId: this.hold!.reservation_id,
      };
      await this.recovery.write(this.record);
      this.assertOwner();
      this.set('held');
    } catch (error) {
      this.assertOwner();
      if (wasUncertain || ambiguousCommand(error)) this.set('uncertainHold');
      else {
        await this.recovery.clear();
        this.reset();
      }
      throw error;
    }
    // Re-read binding permission just before a NEW booking. No projection refresh can revoke a hold.
    if (this.hold?.bound_request_id)
      throw new BoundBooking(
        await this.rememberBinding(this.hold.bound_request_id),
      );
    this.assertBinding();
    this.hold = await this.repo.readHold(this.hold!.reservation_id);
    this.assertOwner();
    if (this.hold.bound_request_id)
      throw new BoundBooking(
        await this.rememberBinding(this.hold.bound_request_id),
      );
    this.assertBinding();
    if (!holdBookable(this.hold, this.now())) {
      await this.recovery.clear();
      this.assertOwner();
      this.reset();
      throw new ApiError(409, 'http', 'SLOT_UNAVAILABLE');
    }
    this.record = {
      ...this.record,
      bookingCommandId: this.bookingBody.client_request_id,
      bookingSubmitted: true,
    };
    await this.recovery.write(this.record);
    this.assertOwner();
    this.assertBinding();
    this.bookingCommand = this.repo.createCollection(this.bookingBody);
    return this.executeBooking();
  }
  private bookingBody: CollectionCreate | null = null;
  private assertBinding() {
    if (this.preparedBinding !== this.addressBinding) {
      // Preserve the acquired hold ID, but never bind it to a changed address.
      // No cancellation API exists: authoritative expiry/read resolves it.
      this.set('restart');
      throw new RecoveryRequired();
    }
  }
  private async executeBooking() {
    this.assertOwner();
    const wasUncertain = this.stage === 'uncertainBooking';
    this.set('booking');
    try {
      const result = await this.bookingCommand!.execute();
      this.assertOwner();
      if (
        !result ||
        !uuid(result.request_id) ||
        result.client_request_id !== this.bookingBody?.client_request_id ||
        ![
          'PENDING_PAYMENT',
          'ACCEPTED',
          'PRE_PLANNING',
          'PLANNED',
          'COMPLETED',
          'CANCELLED',
          'EXPIRED',
        ].includes(result.status) ||
        !uuid(result.payment_id) ||
        !Number.isFinite(Date.parse(result.payment_expires_at)) ||
        !Number.isSafeInteger(result.quoted_amount_minor) ||
        result.quoted_amount_minor < 0 ||
        result.quoted_amount_minor !== this.record?.quotedAmountMinor ||
        result.currency !== 'INR' ||
        !Array.isArray(result.items) ||
        result.items.length !== this.bookingBody.items.length ||
        result.items.some(
          (item, index) =>
            !item ||
            !uuid(item.request_item_id) ||
            item.item_category_code !==
              this.bookingBody!.items[index]!.item_category_code ||
            item.declared_quantity !==
              (this.bookingBody!.items[index]!.declared_quantity ?? null) ||
            item.declared_weight_grams !==
              (this.bookingBody!.items[index]!.declared_weight_grams ?? null) ||
            (item.weight_band ?? null) !==
              (this.bookingBody!.items[index]!.weight_band ?? null) ||
            (item.weight_kg ?? null) !==
              (this.bookingBody!.items[index]!.weight_kg ?? null) ||
            (item.declared_volume_ml ?? null) !==
              (this.bookingBody!.items[index]!.declared_volume_ml ?? null) ||
            !Number.isSafeInteger(item.quoted_line_amount_minor) ||
            item.quoted_line_amount_minor < 0 ||
            item.currency !== result.currency ||
            !(
              item.pricing_rule_version === null ||
              typeof item.pricing_rule_version === 'string'
            ),
        )
      )
        throw new ApiError(201, 'protocol');
      this.record = { ...this.record!, requestId: result.request_id };
      await this.recovery.write(this.record);
      this.assertOwner();
      await this.recovery.clear();
      this.assertOwner();
      this.set('complete');
      return result;
    } catch (error) {
      this.assertOwner();
      // Even a subsequent 409 cannot prove an earlier ambiguous booking failed.
      if (wasUncertain || ambiguousCommand(error)) this.set('uncertainBooking');
      else {
        await this.recovery.clear();
        this.assertOwner();
        this.reset();
      }
      throw error;
    }
  }
  private reset() {
    this.record = null;
    this.hold = null;
    this.holdCommand = null;
    this.bookingCommand = null;
    this.bookingBody = null;
    this.set('idle');
  }
}
