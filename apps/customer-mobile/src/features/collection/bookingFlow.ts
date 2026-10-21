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
  type PhysicalLoad,
  type ProjectedSlot,
  type SlotHold,
} from '../../api/slot-contracts';
import type { CustomerRepositories } from './repository';
import type { BookingRecovery, BookingRecoveryStore } from './bookingRecovery';

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
  load: PhysicalLoad | null;
}
export class PhysicalLoadRequired extends Error {
  constructor() {
    super(
      'An approved physical mass and volume source is required before booking.',
    );
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
  async initialize() {
    this.assertOwner();
    if (this.initialized) return;
    const record = await this.recovery.read(this.owner);
    this.assertOwner();
    this.record = record;
    this.initialized = true;
    if (record) this.set('restart');
  }
  async recoverRestart(): Promise<string | null> {
    await this.initialize();
    this.assertOwner();
    if (this.stage !== 'restart' || !this.record) return null;
    if (this.record.requestId) return this.record.requestId;
    // The backend reservation ID is exactly client_command_id, including after response loss.
    const hold = await this.repo.readHold(
      this.record.reservationId ?? this.record.holdCommandId,
    );
    this.assertOwner();
    this.hold = hold;
    if (this.record.bookingCommandId) throw new RecoveryRequired();
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
  submit(intent?: BookingIntent): Promise<CollectionResponse> {
    this.assertOwner();
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
      if (!intent.load) throw new PhysicalLoadRequired();
      const { context, availability, slot, items } = intent;
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
      this.holdCommand = this.repo.holdSlot({
        client_command_id: holdId,
        context_id: context.serviceability_context_id,
        expected_generation: slot.generation,
        slot_start: slot.slot_start,
        slot_end: slot.slot_end,
        pickup_seconds: availability.standard_pickup_seconds,
        discharge_seconds: availability.standard_discharge_seconds,
        mass_g: intent.load.mass_g,
        volume_ml: intent.load.volume_ml,
      });
      this.record = { owner: this.owner, holdCommandId: holdId };
      // Freeze the eventual booking fields now, before the hold can become ambiguous.
      this.bookingBody = JSON.parse(
        JSON.stringify({
          client_request_id: this.newId(),
          serviceability_context_id: context.serviceability_context_id,
          capacity_reservation_id: holdId,
          slot_start: slot.slot_start,
          slot_end: slot.slot_end,
          items,
        }),
      ) as CollectionCreate;
    }
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
    this.assertBinding();
    this.hold = await this.repo.readHold(this.hold!.reservation_id);
    this.assertOwner();
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
