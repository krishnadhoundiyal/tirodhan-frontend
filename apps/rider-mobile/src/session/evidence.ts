import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { ApiError } from '../api/errors';
import { createEvidenceStore } from '../features/evidence/store';
const root = 'tirodhan.rider.evidence.v1';
const guard = () => {
  if (Platform.OS === 'web') throw new ApiError(0, 'configuration');
};
// Two fixed slots; commit the small manifest last. Failed writes retain the prior state.
const readPointer = async () => {
  const raw = await SecureStore.getItemAsync(root);
  if (!raw) return null;
  let x: { slot: number; parts: number };
  try {
    x = JSON.parse(raw);
  } catch {
    throw new ApiError(0, 'configuration');
  }
  if (
    ![0, 1].includes(x.slot) ||
    !Number.isInteger(x.parts) ||
    x.parts < 1 ||
    x.parts > 16
  )
    throw new ApiError(0, 'configuration');
  return x;
};
export const nativeEvidenceStore = createEvidenceStore({
  get: async () => {
    guard();
    const p = await readPointer();
    if (!p) return null;
    const chunks = await Promise.all(
      Array.from({ length: p.parts }, (_, i) =>
        SecureStore.getItemAsync(`${root}.${p.slot}.${i}`),
      ),
    );
    if (chunks.some((v) => v === null)) throw new ApiError(0, 'configuration');
    return chunks.join('');
  },
  set: async (value) => {
    guard();
    const slot = (await readPointer())?.slot === 0 ? 1 : 0;
    const parts = Math.ceil(value.length / 1500);
    if (parts < 1 || parts > 16) throw new ApiError(0, 'configuration');
    for (let i = 0; i < parts; i++)
      await SecureStore.setItemAsync(
        `${root}.${slot}.${i}`,
        value.slice(i * 1500, (i + 1) * 1500),
        { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
      );
    await SecureStore.setItemAsync(root, JSON.stringify({ slot, parts }), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    // Erase the superseded slot, including former recovery keys/coordinates.
    await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        SecureStore.deleteItemAsync(`${root}.${1 - slot}.${i}`),
      ),
    );
  },
  remove: async () => {
    guard();
    await SecureStore.deleteItemAsync(root);
    await Promise.all(
      Array.from({ length: 32 }, (_, i) =>
        SecureStore.deleteItemAsync(`${root}.${Math.floor(i / 16)}.${i % 16}`),
      ),
    );
  },
});
