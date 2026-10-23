import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { ApiError } from '../api/errors';
import type { SecureCredential } from '../session/store';
import type { Installation, InstallationStore } from './contracts';
function read(value: unknown): Installation {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ApiError(0, 'configuration');
  const x = value as Record<string, unknown>;
  if (
    Object.keys(x).some(
      (k) => !['version', 'id', 'owner', 'reset'].includes(k),
    ) ||
    x.version !== 1 ||
    typeof x.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(x.id) ||
    !(
      x.owner === null ||
      (typeof x.owner === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(x.owner))
    ) ||
    typeof x.reset !== 'boolean'
  )
    throw new ApiError(0, 'configuration');
  return x as Installation;
}
export function createInstallationStore(
  secure: SecureCredential,
  uuid: () => string,
): InstallationStore {
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>) => {
    const task = queue.catch(() => {}).then(work);
    queue = task;
    return task;
  };
  return {
    load: () =>
      serial(async () => {
        const raw = await secure.get();
        if (raw) {
          try {
            return read(JSON.parse(raw));
          } catch {
            throw new ApiError(0, 'configuration');
          }
        }
        const record: Installation = read({
          version: 1,
          id: uuid(),
          owner: null,
          reset: false,
        });
        await secure.set(JSON.stringify(record));
        return record;
      }),
    save: (record) => serial(() => secure.set(JSON.stringify(read(record)))),
  };
}
const key = 'tirodhan.rider.push-installation.v1';
const guard = () => {
  if (Platform.OS === 'web') throw new ApiError(0, 'configuration');
};
export const nativeInstallation = createInstallationStore(
  {
    get: async () => {
      guard();
      return SecureStore.getItemAsync(key);
    },
    set: async (value) => {
      guard();
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    },
    remove: async () => {
      guard();
      await SecureStore.deleteItemAsync(key);
    },
  },
  randomUUID,
);
