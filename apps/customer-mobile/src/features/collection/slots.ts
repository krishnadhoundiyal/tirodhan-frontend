import { ContractUnavailable } from '../../lib/unavailable';
export interface PickupSlot {
  start: string;
  end: string;
  label: string;
}
export interface SlotRepository {
  read(contextId: string, signal?: AbortSignal): Promise<readonly PickupSlot[]>;
}
export const slotRepository: SlotRepository = {
  async read() {
    throw new ContractUnavailable('Pickup slot availability');
  },
};
