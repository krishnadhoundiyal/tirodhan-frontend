import { QueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import { ApiError } from './api/errors';
import { Transport } from './api/transport';
import { createAuthApi, createRiderApi } from './api/client';
import { SessionStore } from './session/store';
import { secureCredential } from './session/secure';
import { riderAdmission } from './session/admission';
import { authFlow } from './features/auth';
import { createFixtureRepository, fixtureOwner } from './features/fixtures';
import { createOperations, type Operations } from './features/operations';
import { riderMode, repositoryForMode } from './configuration';
export const mode = riderMode(__DEV__, process.env.EXPO_PUBLIC_RIDER_MODE);
export const preview = mode === 'SCREEN_PREVIEW';
export const nativeAuth = Platform.OS !== 'web';
const baseUrl = process.env.EXPO_PUBLIC_RIDER_API_BASE_URL ?? '';
if (
  !preview &&
  baseUrl &&
  !baseUrl.startsWith('https://') &&
  !(
    __DEV__ &&
    /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?(?:\/|$)/.test(
      baseUrl,
    )
  )
)
  throw new ApiError(0, 'configuration');
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 0,
      gcTime: 0,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});
const publicTransport = new Transport(
  baseUrl,
  { accessToken: () => null, refresh: async () => {}, clear: async () => {} },
  randomUUID,
);
export const authApi = createAuthApi(publicTransport);
const scopes = new Map<string, Operations>();
export const session = new SessionStore(
  secureCredential,
  (credential) => authApi.refresh(credential),
  () => {
    void queryClient.cancelQueries();
    queryClient.clear();
    scopes.clear();
  },
  {
    read: async (signal) => {
      const principal = await liveApi.principal(signal);
      return { userId: principal.user_id, roles: principal.roles };
    },
  },
);
const liveTransport = new Transport(
  baseUrl,
  session,
  randomUUID,
  fetch,
  15000,
  () => !preview && riderAdmission(session.getSnapshot()) === 'admitted',
);
export const liveApi = createRiderApi(liveTransport);
export const fixtures = createFixtureRepository();
export const repository = repositoryForMode(mode, liveApi, fixtures.repository);
export const auth = authFlow(authApi, session, randomUUID);
export async function recheckSession() {
  await session.renewIfExpired();
  await session.loadPrincipal();
}
export function operationsForSession() {
  const state = session.getSnapshot();
  const owner = preview ? fixtureOwner : state.userId;
  if (!owner || riderAdmission(state, preview) !== 'admitted')
    throw new ApiError(403);
  const identity = session.requestIdentity();
  const key = ['rider', mode, owner, state.ownerVersion, identity];
  const name = JSON.stringify(key);
  let operations = scopes.get(name);
  if (!operations) {
    operations = createOperations(repository, queryClient, {
      key,
      owner,
      current: () =>
        preview ||
        (session.requestIdentity() === identity &&
          session.getSnapshot().userId === owner &&
          riderAdmission(session.getSnapshot()) === 'admitted'),
      onForbidden: () => session.loadPrincipal(),
    });
    scopes.set(name, operations);
  }
  return operations;
}
export async function logout() {
  if (preview) {
    queryClient.clear();
    scopes.clear();
    auth.clear();
    return;
  }
  const credential = secureCredential.get().catch(() => null);
  auth.clear();
  await session.clear(credential);
  const value = await credential;
  if (value) await authApi.logout(value);
}
