import type { SecureCredential } from '../../session/store';
import { uuid } from '../../api/slot-contracts';
import { ApiError } from '../../api/errors';
import type { HoldSlot } from '../../api/slot-contracts';
import type { CollectionCreate } from '../../api/contracts';
import {
  validConfirmation,
  validItem,
  money,
} from '../../api/weight-contracts';

export interface BookingRecovery {
  owner: string;
  holdCommandId: string;
  reservationId?: string;
  bookingCommandId?: string;
  requestId?: string;
  holdBody?: HoldSlot;
  bookingBody?: CollectionCreate;
  bookingSubmitted?: boolean;
  quotedAmountMinor?: number;
}
// One owner-scoped prepared workflow. Browser storage is encrypted and lease fenced.
export class BookingRecoveryStore {
  private writes: Promise<unknown> = Promise.resolve();
  constructor(private readonly storage: SecureCredential) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.writes.catch(() => {}).then(work);
    this.writes = next;
    return next;
  }
  read(owner: string): Promise<BookingRecovery | null> {
    return this.serial(async () => {
      const raw = await this.storage.get();
      if (!raw) return null;
      let value: BookingRecovery;
      try {
        value = JSON.parse(raw) as BookingRecovery;
      } catch {
        throw new ApiError(200, 'protocol');
      }
      if (
        !value ||
        typeof value.owner !== 'string' ||
        !uuid(value.holdCommandId) ||
        [value.reservationId, value.bookingCommandId, value.requestId].some(
          (v) => v !== undefined && !uuid(v),
        )
      )
        throw new ApiError(200, 'protocol');
      if (value.owner !== owner) {
        await this.storage.remove();
        return null;
      }
      if (value.holdBody || value.bookingBody) {
        const hold = value.holdBody,
          booking = value.bookingBody;
        if (
          !hold ||
          !booking ||
          hold.client_command_id !== value.holdCommandId ||
          booking.client_request_id !== value.bookingCommandId ||
          booking.capacity_reservation_id !== value.holdCommandId ||
          hold.context_id !== booking.serviceability_context_id ||
          hold.slot_start !== booking.slot_start ||
          hold.slot_end !== booking.slot_end ||
          JSON.stringify(hold.items) !== JSON.stringify(booking.items) ||
          JSON.stringify(hold.confirmed_quote) !==
            JSON.stringify(booking.confirmed_quote) ||
          !Array.isArray(hold.items) ||
          !hold.items.length ||
          !hold.items.every((item) => validItem(item, true)) ||
          !validConfirmation(hold.confirmed_quote) ||
          !money(value.quotedAmountMinor) ||
          typeof value.bookingSubmitted !== 'boolean'
        )
          throw new ApiError(200, 'protocol');
      }
      return value;
    });
  }
  write(value: BookingRecovery) {
    // No address, coordinates, OTP or credentials are part of either API command.
    const {
      owner,
      holdCommandId,
      reservationId,
      bookingCommandId,
      requestId,
      holdBody,
      bookingBody,
      bookingSubmitted,
      quotedAmountMinor,
    } = value;
    return this.serial(() =>
      this.storage.set(
        JSON.stringify({
          owner,
          holdCommandId,
          reservationId,
          bookingCommandId,
          requestId,
          holdBody,
          bookingBody,
          bookingSubmitted,
          quotedAmountMinor,
        }),
      ),
    );
  }
  clear() {
    return this.serial(() => this.storage.remove());
  }
  resolve(owner: string, requestId: string) {
    return this.serial(async () => {
      const raw = await this.storage.get();
      if (!raw) return;
      const value = JSON.parse(raw) as BookingRecovery;
      if (value.owner === owner && value.requestId === requestId)
        await this.storage.remove();
    });
  }
}
