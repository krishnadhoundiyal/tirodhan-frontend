import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { BookingRecoveryStore } from '../features/collection/bookingRecovery';

const key = 'tirodhan.customer.booking-recovery';
// Browser sessions remain memory-only, as with access credentials. Native stores IDs only.
let webRecord: string | null = null;
export const bookingRecovery = new BookingRecoveryStore({
  get: () =>
    Platform.OS === 'web'
      ? Promise.resolve(webRecord)
      : SecureStore.getItemAsync(key),
  set: (value) => {
    if (Platform.OS === 'web') {
      webRecord = value;
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  remove: () => {
    if (Platform.OS === 'web') {
      webRecord = null;
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(key);
  },
});
