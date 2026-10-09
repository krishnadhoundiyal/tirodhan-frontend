import * as SecureStore from 'expo-secure-store';
import type { SecureCredential } from './store';
const key = 'tirodhan.customer.refresh';
export const secureCredential: SecureCredential = {
  get: () => SecureStore.getItemAsync(key),
  set: (value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  remove: () => SecureStore.deleteItemAsync(key),
};
