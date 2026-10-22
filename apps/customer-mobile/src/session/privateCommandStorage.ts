import type { SecureCredential } from './store';
// A single secure record, chunked for native keychain value limits. The pointer
// switches only after every new chunk is durable. Partial writes never become replayable.
export function privateCommandStorage(
  port: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  },
  key: string,
  newId: () => string,
): SecureCredential {
  type Pointer = { format: 'chunks-v1'; id: string; count: number };
  const pointer = (raw: string | null): Pointer | null => {
    if (!raw) return null;
    let value: Partial<Pointer>;
    try {
      value = JSON.parse(raw) as Partial<Pointer>;
    } catch {
      return null;
    }
    return value?.format === 'chunks-v1' &&
      typeof value.id === 'string' &&
      /^[a-zA-Z0-9-]+$/.test(value.id) &&
      Number.isSafeInteger(value.count) &&
      value.count! > 0 &&
      value.count! <= 10000
      ? (value as Pointer)
      : null;
  };
  const chunkKey = (p: Pointer, i: number) => `${key}.${p.id}.${i}`;
  const discard = async (p: Pointer | null) => {
    if (p) for (let i = 0; i < p.count; i++) await port.remove(chunkKey(p, i));
  };
  return {
    get: async () => {
      const raw = await port.get(key),
        p = pointer(raw);
      if (!p) return raw; // Read the prior identifier-only format for migration/reconciliation.
      const chunks: string[] = [];
      for (let i = 0; i < p.count; i++) {
        const chunk = await port.get(chunkKey(p, i));
        if (chunk === null)
          throw new Error('Pending command storage is incomplete');
        chunks.push(chunk);
      }
      return chunks.join('');
    },
    set: async (value) => {
      const old = pointer(await port.get(key));
      // 400 UTF-16 characters stay below 2048 UTF-8 bytes, including non-ASCII codes.
      const p: Pointer = {
        format: 'chunks-v1',
        id: newId(),
        count: Math.ceil(value.length / 400),
      };
      if (p.count > 10000)
        throw new Error('Pending command exceeds secure storage limit');
      try {
        for (let i = 0; i < p.count; i++)
          await port.set(chunkKey(p, i), value.slice(i * 400, (i + 1) * 400));
        await port.set(key, JSON.stringify(p));
      } catch (error) {
        await discard(p).catch(() => {});
        throw error;
      }
      await discard(old).catch(() => {});
    },
    remove: async () => {
      const old = pointer(await port.get(key));
      // Delete material before the pointer so a failed deletion remains detectable/retryable.
      await discard(old);
      await port.remove(key);
    },
  };
}
