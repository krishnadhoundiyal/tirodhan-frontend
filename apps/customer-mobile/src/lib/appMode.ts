export type AppMode = 'SCREEN_PREVIEW' | 'NONPROD' | 'PRODUCTION';

export function resolveAppMode(
  value: string | undefined,
  development: boolean,
  expoGo: boolean,
): AppMode {
  if (value === undefined || value === '') return 'PRODUCTION';
  if (value === 'SCREEN_PREVIEW') {
    if (development === true && expoGo === true) return value;
    throw new Error('SCREEN_PREVIEW requires a development bundle in Expo Go.');
  }
  if (value === 'NONPROD' || value === 'PRODUCTION') return value;
  throw new Error(
    'Invalid EXPO_PUBLIC_APP_MODE. Restart with a supported mode.',
  );
}

// Survives Fast Refresh in the same JS runtime; switching modes needs a restart.
export function lockAppMode(mode: AppMode, lock: { mode?: AppMode }) {
  if (lock.mode !== undefined && lock.mode !== mode)
    throw new Error('Application mode changed. Fully restart the application.');
  lock.mode = mode;
  return mode;
}
