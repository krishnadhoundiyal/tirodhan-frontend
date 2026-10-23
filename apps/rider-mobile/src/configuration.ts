import { ApiError } from './api/errors';
import type { RiderRepository } from './api/client';
export function riderMode(development: boolean, mode: string | undefined) {
  if (mode === 'SCREEN_PREVIEW') {
    if (!development) throw new ApiError(0, 'configuration');
    return 'SCREEN_PREVIEW' as const;
  }
  if (mode && mode !== 'LIVE') throw new ApiError(0, 'configuration');
  return 'LIVE' as const;
}
export function repositoryForMode(
  mode: ReturnType<typeof riderMode>,
  live: RiderRepository,
  fixtures: RiderRepository,
) {
  return mode === 'SCREEN_PREVIEW' ? fixtures : live;
}
