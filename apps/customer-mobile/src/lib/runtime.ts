import { QueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { ApiError } from '../api/errors';
import type { AccessTokenResponse } from '../api/contracts';
import { Transport } from '../api/transport';
import { SessionStore } from '../session/store';
import { secureCredential } from '../session/secure';

const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
if (!__DEV__ && baseUrl && !baseUrl.startsWith('https://'))
  throw new Error('Production API must use HTTPS');
export const previewCatalogue =
  __DEV__ && process.env.EXPO_PUBLIC_PREVIEW_CATALOGUE === 'true';
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      gcTime: 300000,
      retry: (count, error) =>
        count < 1 &&
        error instanceof ApiError &&
        (error.status >= 500 || error.kind === 'network'),
      refetchOnReconnect: true,
    },
    mutations: { retry: false },
  },
});
const publicTransport = new Transport(
  baseUrl,
  { accessToken: () => null, refresh: async () => {}, clear: async () => {} },
  randomUUID,
);
export const session = new SessionStore(
  secureCredential,
  (refresh_token) =>
    publicTransport.request<AccessTokenResponse>('/v1/auth/refresh', {
      method: 'POST',
      body: { refresh_token },
      authenticated: false,
    }),
  () => {
    void queryClient.cancelQueries();
    queryClient.clear();
  },
  // No principal reader until /v1/auth/me exists. Product entry stays blocked.
);
export const transport = new Transport(baseUrl, session, randomUUID);
export async function logout() {
  const credential = await secureCredential.get();
  try {
    if (credential)
      await publicTransport.request('/v1/auth/logout', {
        method: 'POST',
        body: { refresh_token: credential },
        authenticated: false,
      });
  } finally {
    await session.clear();
  }
}
