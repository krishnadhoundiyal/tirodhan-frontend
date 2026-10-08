import { ContractUnavailable } from '../../lib/unavailable';
// Presentation model only. No backend DTO/status vocabulary is invented here.
export interface Journey {
  id: string;
  title: string;
  slotLabel: string;
  addressLabel: string;
  steps: { label: string; detail: string; completed: boolean }[];
}
export interface ActivityRepository {
  read(
    segment: 'active' | 'history',
    signal?: AbortSignal,
  ): Promise<readonly Journey[]>;
}
export const activityRepository: ActivityRepository = {
  async read() {
    throw new ContractUnavailable('Collection journey');
  },
};
