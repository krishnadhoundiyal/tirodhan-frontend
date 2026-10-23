import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { SecureCredential } from './store';
import { ApiError } from '../api/errors';
const key = 'tirodhan.rider.refresh';
function nativeOnly() {
  if (Platform.OS === 'web') throw new ApiError(0, 'configuration');
}
export const secureCredential: SecureCredential = {
  get: async () => {
    nativeOnly();
    return SecureStore.getItemAsync(key);
  },
  set: async (value) => {
    nativeOnly();
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  remove: async () => {
    nativeOnly();
    await SecureStore.deleteItemAsync(key);
  },
};
