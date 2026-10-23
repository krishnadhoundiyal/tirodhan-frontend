import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { ApiError } from '../api/errors';
import { privateCommandStorage } from './privateCommandStorage';
import { PaymentRecoveryStore } from '../features/collection/paymentRecovery';

const nativeStorage = privateCommandStorage(
  {
    get: (key) => SecureStore.getItemAsync(key),
    set: (key, value) =>
      SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      }),
    remove: (key) => SecureStore.deleteItemAsync(key),
  },
  'tirodhan.customer.payment-recovery',
  randomUUID,
);
export const paymentRecovery = new PaymentRecoveryStore({
  get: () =>
    Platform.OS === 'web'
      ? Promise.reject(new ApiError(0, 'configuration'))
      : nativeStorage.get(),
  set: (value) =>
    Platform.OS === 'web'
      ? Promise.reject(new ApiError(0, 'configuration'))
      : nativeStorage.set(value),
  remove: () =>
    Platform.OS === 'web' ? Promise.resolve() : nativeStorage.remove(),
});
