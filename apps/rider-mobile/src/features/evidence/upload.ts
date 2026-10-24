import { ApiError } from '../../api/errors';
import type { Media } from './contracts';
export function azureUploadUrl(
  value: string,
  asset: Media,
  expiresAt: string | null,
  now = Date.now(),
) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hash ||
      !url.hostname.endsWith('.blob.core.windows.net') ||
      url.port ||
      !url.pathname.endsWith('/' + asset.objectKey) ||
      url.searchParams.get('sr') !== 'b' ||
      url.searchParams.get('spr') !== 'https' ||
      !url.searchParams.get('sig') ||
      !/^[cw]+$/.test(url.searchParams.get('sp') ?? '') ||
      !expiresAt ||
      !Number.isFinite(Date.parse(expiresAt))
    )
      throw new Error();
    if (Date.parse(expiresAt) <= now + 5000) throw new ApiError(403);
    return value;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'configuration');
  }
}
export function createBlobUploader(
  fetcher: typeof fetch = fetch,
  timeoutMs = 60000,
) {
  return async (
    asset: Media,
    authorization: { authorization: string; expiresAt: string | null },
    bytes: Uint8Array,
    current: () => void,
    signal?: AbortSignal,
  ) => {
    current();
    const url = azureUploadUrl(
      authorization.authorization,
      asset,
      authorization.expiresAt,
    );
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel);
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(cancel, timeoutMs);
    try {
      const result = await fetcher(url, {
        method: 'PUT',
        headers: {
          'Content-Type': asset.contentType,
          'x-ms-blob-type': 'BlockBlob',
        },
        body: bytes as unknown as BodyInit,
        redirect: 'error',
        credentials: 'omit',
        signal: controller.signal,
      });
      current();
      if (controller.signal.aborted) throw new ApiError(0, 'cancelled');
      if (result.status === 401 || result.status === 403)
        throw new ApiError(403, 'http');
      if (result.status !== 201) throw new ApiError(0, 'network');
    } catch (error) {
      throw error instanceof ApiError ? error : new ApiError(0, 'network');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  };
}
export type BlobUploader = ReturnType<typeof createBlobUploader>;
