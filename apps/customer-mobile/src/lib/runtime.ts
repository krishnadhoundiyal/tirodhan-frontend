import { QueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { isRunningInExpoGo } from 'expo';
import { ApiError } from '../api/errors';
import type { AccessTokenResponse } from '../api/contracts';
import { Transport } from '../api/transport';
import { SessionStore } from '../session/store';
import { secureCredential } from '../session/secure';
import { notificationCredential } from '../notifications/credential';
import { capabilityGate, type CustomerCapability } from '../api/capabilities';
import { createCustomerApi } from '../api/customer-client';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { PushLifecycle } from '../notifications/lifecycle';
import { isExpoGoPreview } from '../notifications/environment';
import { resolveAppMode, lockAppMode, type AppMode } from './appMode';
import {
  ScreenPreviewTransport,
  blockedPreviewCredential,
} from '../preview/isolation';
import { previewNavigation } from '../preview/navigation';

const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
const modeGlobal = globalThis as typeof globalThis & {
  __tirodhanCustomerModeLock?: { mode?: AppMode };
};
const modeLock = (modeGlobal.__tirodhanCustomerModeLock ??= {});
export const appMode = lockAppMode(
  resolveAppMode(
    process.env.EXPO_PUBLIC_APP_MODE,
    __DEV__,
    isRunningInExpoGo(),
  ),
  modeLock,
);
if (
  (!__DEV__ || appMode === 'NONPROD') &&
  baseUrl &&
  !baseUrl.startsWith('https://')
)
  throw new Error('Backend API must use HTTPS');
// Compatibility name for existing screens; the old env flag is never read.
export const previewCatalogue = appMode === 'SCREEN_PREVIEW';
const ModeTransport = previewCatalogue ? ScreenPreviewTransport : Transport;
const customerCapabilities = new Set<string>(
  (process.env.EXPO_PUBLIC_CUSTOMER_CAPABILITIES ?? '')
    .split(',')
    .map((value: string) => value.trim())
    .filter(Boolean),
);
export const hasCustomerCapability = (capability: CustomerCapability) =>
  customerCapabilities.has(capability);
export const requireCustomerCapability = capabilityGate(customerCapabilities);
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
const publicTransport = new ModeTransport(
  baseUrl,
  { accessToken: () => null, refresh: async () => {}, clear: async () => {} },
  randomUUID,
);
export const session = new SessionStore(
  previewCatalogue ? blockedPreviewCredential : secureCredential,
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
export const transport = new ModeTransport(
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
    if (previewCatalogue) throw new ApiError(0, 'preview');
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
  if (previewCatalogue) {
    await queryClient.cancelQueries();
    queryClient.clear();
    notificationCredential.clear();
    pushLifecycle.clear();
    previewNavigation.reset();
    return;
  }
  try {
    if (Platform.OS !== 'web' && !previewCatalogue && !isExpoGoPreview())
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
