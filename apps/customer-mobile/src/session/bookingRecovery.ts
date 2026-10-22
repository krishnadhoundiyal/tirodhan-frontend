import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { BookingRecoveryStore } from '../features/collection/bookingRecovery';
import { privateCommandStorage } from './privateCommandStorage';
import { randomUUID } from 'expo-crypto';

const key = 'tirodhan.customer.booking-recovery';
// Browser stays memory-only: no sensitive command is written to ordinary browser storage.
let webRecord: string | null = null;
const nativeStorage = privateCommandStorage(
  {
    get: (key) => SecureStore.getItemAsync(key),
    set: (key, value) =>
      SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    remove: (key) => SecureStore.deleteItemAsync(key),
  },
  key,
  randomUUID,
);
export const bookingRecovery = new BookingRecoveryStore({
  get: () =>
    Platform.OS === 'web' ? Promise.resolve(webRecord) : nativeStorage.get(),
  set: (value) => {
    if (Platform.OS === 'web') {
      webRecord = value;
      return Promise.resolve();
    }
    return nativeStorage.set(value);
  },
  remove: () => {
    if (Platform.OS === 'web') {
      webRecord = null;
      return Promise.resolve();
    }
    return nativeStorage.remove();
  },
});
