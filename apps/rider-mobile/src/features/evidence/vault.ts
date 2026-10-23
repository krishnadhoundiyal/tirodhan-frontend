import {
  AESEncryptionKey,
  AESSealedData,
  aesEncryptAsync,
  aesDecryptAsync,
  randomUUID,
} from 'expo-crypto';
import { File, Directory, Paths } from 'expo-file-system';
import { ApiError } from '../../api/errors';
import type { MediaVault } from './contracts';
const directory = () =>
  new Directory(Paths.document, 'rider-private-evidence-v1');
const file = (id: string) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new ApiError(0, 'configuration');
  return new File(directory(), id + '.sealed');
};
export const mediaLimit = 20 * 1024 * 1024;
export const nativeVault: MediaVault = {
  seal: async (uri, type, capturedAt, current) => {
    if (!uri.startsWith(Paths.cache.uri))
      throw new ApiError(0, 'configuration');
    const source = new File(uri);
    let destination: File | null = null;
    try {
      current();
      if (source.size <= 0 || source.size > mediaLimit) throw new ApiError(422);
      const bytes = await source.bytes();
      current();
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const video =
        bytes[4] === 102 &&
        bytes[5] === 116 &&
        bytes[6] === 121 &&
        bytes[7] === 112;
      if ((type === 'PHOTO' && !jpeg) || (type === 'VIDEO' && !video))
        throw new ApiError(422);
      const contentType =
        type === 'PHOTO'
          ? 'image/jpeg'
          : bytes[8] === 113 && bytes[9] === 116
            ? 'video/quicktime'
            : 'video/mp4';
      const key = await AESEncryptionKey.generate(256),
        id = randomUUID();
      const sealed = await aesEncryptAsync(bytes, key, {
        additionalData: new TextEncoder().encode(
          'tirodhan.rider.evidence.v1:' + id,
        ),
      });
      current();
      directory().create({ intermediates: true, idempotent: true });
      destination = file(id);
      destination.write(await sealed.combined());
      current();
      return {
        id,
        key: await key.encoded('base64'),
        capturedAt,
        createdAt: Date.now(),
        size: bytes.length,
        type,
        contentType,
      };
    } catch (error) {
      if (destination?.exists) destination.delete();
      throw error instanceof ApiError
        ? error
        : new ApiError(0, 'configuration');
    } finally {
      if (source.exists) source.delete();
    }
  },
  read: async (media) => {
    if (Date.now() - media.createdAt > 86400000)
      throw new ApiError(0, 'configuration');
    try {
      const bytes = await aesDecryptAsync(
        AESSealedData.fromCombined(await file(media.id).bytes()),
        await AESEncryptionKey.import(media.key, 'base64'),
        {
          additionalData: new TextEncoder().encode(
            'tirodhan.rider.evidence.v1:' + media.id,
          ),
        },
      );
      if (bytes.length !== media.size) throw new Error();
      return bytes;
    } catch {
      throw new ApiError(0, 'configuration');
    }
  },
  remove: async (id) => {
    const value = file(id);
    if (value.exists) value.delete();
  },
  sweep: async (keep) => {
    const dir = directory();
    if (dir.exists)
      for (const entry of dir.list())
        if (entry instanceof File && entry.name !== keep + '.sealed')
          entry.delete();
    // Expo Camera's app-private temporary output: discard interrupted, unsealed captures.
    const camera = new Directory(Paths.cache, 'Camera');
    if (camera.exists)
      for (const entry of camera.list())
        if (entry instanceof File) entry.delete();
  },
};
