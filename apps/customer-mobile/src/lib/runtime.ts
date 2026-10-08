import { QueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { ApiError } from '../api/errors';
import type { AccessTokenResponse } from '../api/contracts';
import { Transport } from '../api/transport';
import { SessionStore } from '../session/store';
import { secureCredential } from '../session/secure';
import { notificationCredential } from '../notifications/credential';
import { capabilityGate, isDevelopmentPreview } from '../api/capabilities';
import { createCustomerApi } from '../api/customer-client';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { PushLifecycle } from '../notifications/lifecycle';

const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
if (!__DEV__ && baseUrl && !baseUrl.startsWith('https://'))
  throw new Error('Production API must use HTTPS');
export const previewCatalogue = isDevelopmentPreview(
  __DEV__,
  process.env.EXPO_PUBLIC_PREVIEW_CATALOGUE,
);
export const requireCustomerCapability = capabilityGate(
  new Set(
    (process.env.EXPO_PUBLIC_CUSTOMER_CAPABILITIES ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ),
);
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
    notificationCredential.clear();
    pushLifecycle.clear();
  },
  {
    read: async (signal) => {
      const result = await customerApi.principal(signal);
      return { userId: result.user_id, roles: result.roles };
    },
  },
);
export const transport = new Transport(
  baseUrl,
  session,
  randomUUID,
  fetch,
  15000,
  () => !previewCatalogue,
);
export const customerApi = createCustomerApi(
  transport,
  requireCustomerCapability,
);
let pushDeviceId: string | null = null;
export const pushLifecycle = new PushLifecycle(
  customerApi,
  async () => {
    if (pushDeviceId) return pushDeviceId;
    if (Platform.OS === 'web') return (pushDeviceId = randomUUID());
    pushDeviceId = await SecureStore.getItemAsync(
      'tirodhan.push-installation-id',
    );
    if (!pushDeviceId) {
      pushDeviceId = randomUUID();
      await SecureStore.setItemAsync(
        'tirodhan.push-installation-id',
        pushDeviceId,
      );
    }
    return pushDeviceId;
  },
  () => session.getSnapshot().userId,
);
export async function logout() {
  try {
    if (Platform.OS !== 'web' && !previewCatalogue)
      await pushLifecycle.revoke().catch(() => {});
    const credential = await secureCredential.get();
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
