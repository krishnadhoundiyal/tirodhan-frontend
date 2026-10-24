import { nativeVault, mediaLimit } from '../features/evidence/vault';
import { aesEncryptAsync, aesDecryptAsync } from 'expo-crypto';
const mockFiles = new Map<string, Uint8Array>();
const mockId = '11111111-1111-4111-8111-111111111111';
const mockJpeg = new Uint8Array([255, 216, 255, 1, 2, 3, 4, 5]);
const mockCipher = new Uint8Array([7, 8, 9, 10, 11]);
jest.mock('expo-crypto', () => ({
  randomUUID: () => mockId,
  AESEncryptionKey: {
    generate: jest.fn(async () => ({
      encoded: async () => 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    })),
    import: jest.fn(async () => ({})),
  },
  AESSealedData: { fromCombined: (bytes: Uint8Array) => bytes },
  aesEncryptAsync: jest.fn(async () => ({ combined: async () => mockCipher })),
  aesDecryptAsync: jest.fn(async () => mockJpeg),
}));
jest.mock('expo-file-system', () => {
  const path = (items: (string | { uri: string })[]) =>
    items
      .map((v) => (typeof v === 'string' ? v : v.uri))
      .reduce(
        (prefix, item) =>
          prefix ? prefix.replace(/\/$/, '') + '/' + item : item,
        '',
      );
  class File {
    uri: string;
    constructor(...items: (string | { uri: string })[]) {
      this.uri = path(items);
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri)?.length ?? 0;
    }
    get name() {
      return this.uri.split('/').pop();
    }
    async bytes() {
      if (!this.exists) throw new Error('missing');
      return mockFiles.get(this.uri)!;
    }
    write(bytes: Uint8Array) {
      mockFiles.set(this.uri, bytes);
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...items: (string | { uri: string })[]) {
      this.uri = path(items);
    }
    get exists() {
      return true;
    }
    create() {}
    list() {
      return [...mockFiles.keys()]
        .filter((k) => k.startsWith(this.uri + '/'))
        .map((k) => new File(k));
    }
  }
  return {
    File,
    Directory,
    Paths: {
      document: { uri: 'file:///documents' },
      cache: { uri: 'file:///cache/' },
    },
  };
});
beforeEach(() => {
  mockFiles.clear();
  jest.clearAllMocks();
});
const capture = async (current = () => {}) => {
  mockFiles.set('file:///cache/Camera/capture.jpg', mockJpeg);
  return nativeVault.seal(
    'file:///cache/Camera/capture.jpg',
    'PHOTO',
    new Date().toISOString(),
    current,
  );
};

test('camera plaintext is removed and only sealed bytes persist; key is returned for secure journaling', async () => {
  const local = await capture();
  expect(mockFiles.has('file:///cache/Camera/capture.jpg')).toBe(false);
  expect([...mockFiles.values()]).toEqual([mockCipher]);
  expect(local.key).toMatch(/=$/);
  expect(aesEncryptAsync).toHaveBeenCalledWith(mockJpeg, expect.anything(), {
    additionalData: expect.any(Uint8Array),
  });
  expect(await nativeVault.read(local)).toEqual(mockJpeg);
  expect(aesDecryptAsync).toHaveBeenCalledWith(mockCipher, expect.anything(), {
    additionalData: expect.any(Uint8Array),
  });
  await nativeVault.remove(local.id);
  expect(mockFiles.size).toBe(0);
});

test('invalid camera output and cancelled capture remove plaintext without retaining an orphan key/file', async () => {
  mockFiles.set('file:///cache/Camera/bad.jpg', new Uint8Array([1, 2, 3]));
  await expect(
    nativeVault.seal(
      'file:///cache/Camera/bad.jpg',
      'PHOTO',
      new Date().toISOString(),
      () => {},
    ),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    capture(() => {
      throw new Error('owner changed');
    }),
  ).rejects.toMatchObject({ kind: 'configuration' });
  expect(mockFiles.size).toBe(0);
});

test('interrupted unsealed camera capture and unrelated sealed files are purged while pending original survives', async () => {
  const local = await capture();
  mockFiles.set('file:///cache/Camera/interrupted.jpg', mockJpeg);
  mockFiles.set(
    'file:///documents/rider-private-evidence-v1/other.sealed',
    mockCipher,
  );
  await nativeVault.sweep(local.id);
  expect([...mockFiles.keys()]).toEqual([
    `file:///documents/rider-private-evidence-v1/${mockId}.sealed`,
  ]);
});

test('oversized evidence and decryption failure cannot upload unrelated or corrupted bytes', async () => {
  const local = await capture();
  jest
    .mocked(aesDecryptAsync)
    .mockRejectedValueOnce(new Error('authentication tag mismatch'));
  await expect(nativeVault.read(local)).rejects.toMatchObject({
    kind: 'configuration',
  });
  mockFiles.set(
    'file:///cache/Camera/large.mp4',
    new Uint8Array(mediaLimit + 1),
  );
  await expect(
    nativeVault.seal(
      'file:///cache/Camera/large.mp4',
      'VIDEO',
      new Date().toISOString(),
      () => {},
    ),
  ).rejects.toMatchObject({ status: 422 });
  expect(mockFiles.has('file:///cache/Camera/large.mp4')).toBe(false);
});
