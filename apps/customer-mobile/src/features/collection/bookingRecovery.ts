import type { SecureCredential } from '../../session/store';
import { uuid } from '../../api/slot-contracts';
import { ApiError } from '../../api/errors';

export interface BookingRecovery {
  owner: string;
  holdCommandId: string;
  reservationId?: string;
  bookingCommandId?: string;
  requestId?: string;
}
// One identifier-only record, not a draft store or offline queue. Writes precede HTTP.
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
      return value;
    });
  }
  write(value: BookingRecovery) {
    // Explicit projection prevents future callers persisting a booking draft here.
    const { owner, holdCommandId, reservationId, bookingCommandId, requestId } =
      value;
    return this.serial(() =>
      this.storage.set(
        JSON.stringify({
          owner,
          holdCommandId,
          reservationId,
          bookingCommandId,
          requestId,
        }),
      ),
    );
  }
  clear() {
    return this.serial(() => this.storage.remove());
  }
}
