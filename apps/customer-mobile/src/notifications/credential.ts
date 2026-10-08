import type { DevicePushToken } from 'expo-notifications';
let token: DevicePushToken | null = null;
let generation = 0;
export const notificationCredential = {
  generation: () => generation,
  set: (next: DevicePushToken, expected = generation) => {
    if (expected === generation) token = next;
  },
  has: () => token !== null,
  clear: () => {
    ++generation;
    token = null;
  },
};
