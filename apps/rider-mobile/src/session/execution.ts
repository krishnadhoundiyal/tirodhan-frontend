import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createJournal } from '../features/execution/journal';
import { ApiError } from '../api/errors';
const key = 'tirodhan.rider.execution.v1';
const native = () => {
  if (Platform.OS === 'web') throw new ApiError(0, 'configuration');
};
export const nativeExecutionJournal = createJournal({
  get: async () => {
    native();
    return SecureStore.getItemAsync(key);
  },
  set: async (value) => {
    native();
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  remove: async () => {
    native();
    await SecureStore.deleteItemAsync(key);
  },
});
