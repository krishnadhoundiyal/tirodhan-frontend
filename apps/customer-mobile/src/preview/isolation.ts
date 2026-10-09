import { ApiError } from '../api/errors';
import { Transport, type PreparedCommand } from '../api/transport';
import type { SecureCredential } from '../session/store';

// Reject before fetch, token lookup, refresh, or command preparation.
export class ScreenPreviewTransport extends Transport {
  override async request<T>(): Promise<T> {
    throw new ApiError(0, 'preview');
  }
  override command<T>(): PreparedCommand<T> {
    return { execute: () => this.request<T>() };
  }
}

const rejectCredential = async (): Promise<never> => {
  throw new ApiError(0, 'preview');
};
// Defense if a caller accidentally invokes the real store in preview.
export const blockedPreviewCredential: SecureCredential = {
  get: rejectCredential,
  set: rejectCredential,
  remove: rejectCredential,
};
