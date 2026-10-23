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
import {
  createFixtureRepository,
  fixtureOwner,
  type FixtureScenario,
} from './features/fixtures';
import { createOperations, type Operations } from './features/operations';
import { riderMode, repositoryForMode } from './configuration';
import { createExecutionApi } from './api/execution-client';
import {
  createExecutionService,
  type ExecutionService,
} from './features/execution/service';
import { nativeExecutionJournal } from './session/execution';
import { memoryJournal } from './features/execution/journal';
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
const executionScopes = new Map<string, ExecutionService>();
let fixtureGeneration = 0;
export const executionJournal = preview
  ? memoryJournal()
  : nativeExecutionJournal;
export const session = new SessionStore(
  secureCredential,
  (credential) => authApi.refresh(credential),
  () => {
    void queryClient.cancelQueries();
    queryClient.clear();
    scopes.clear();
    executionScopes.clear();
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
const liveExecutionApi = createExecutionApi(liveTransport);
export const fixtures = createFixtureRepository();
export const repository = repositoryForMode(mode, liveApi, fixtures.repository);
export const auth = authFlow(authApi, session, randomUUID);
let lastOwner: string | null = null;
session.subscribe(() => {
  const owner = session.getSnapshot().userId;
  if (owner && lastOwner && owner !== lastOwner)
    void executionJournal.clear().catch(() => {});
  if (owner) lastOwner = owner;
});
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
  const epoch = fixtureGeneration;
  const key = ['rider', mode, owner, state.ownerVersion, identity, epoch];
  const name = JSON.stringify(key);
  let operations = scopes.get(name);
  if (!operations) {
    operations = createOperations(repository, queryClient, {
      key,
      owner,
      current: () =>
        (preview && fixtureGeneration === epoch) ||
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
    fixtureGeneration++;
    queryClient.clear();
    scopes.clear();
    executionScopes.clear();
    await executionJournal.clear();
    auth.clear();
    return;
  }
  const credential = secureCredential.get().catch(() => null);
  auth.clear();
  await session.clear(credential);
  let journalClearFailed = false;
  try {
    await executionJournal.clear();
  } catch {
    journalClearFailed = true;
  }
  const value = await credential;
  try {
    if (value) await authApi.logout(value);
  } finally {
    if (journalClearFailed) throw new ApiError(0, 'configuration');
  }
}
export function executionForSession() {
  const state = session.getSnapshot();
  const identity = session.requestIdentity();
  const epoch = fixtureGeneration;
  const owner = preview ? fixtureOwner : state.userId;
  const operations = operationsForSession();
  const key = JSON.stringify(operations.key('assignment'));
  let service = executionScopes.get(key);
  if (!service) {
    if (!owner) throw new ApiError(403);
    service = createExecutionService(
      preview ? fixtures.execution : liveExecutionApi,
      executionJournal,
      queryClient,
      operations,
      {
        owner,
        uuid: randomUUID,
        current: () =>
          (preview && fixtureGeneration === epoch) ||
          (!preview &&
            session.requestIdentity() === identity &&
            session.getSnapshot().userId === owner &&
            riderAdmission(session.getSnapshot()) === 'admitted'),
      },
    );
    executionScopes.set(key, service);
  }
  return service;
}
export async function resetFixture(value: FixtureScenario) {
  if (!preview) throw new ApiError(0, 'preview');
  fixtureGeneration++;
  fixtures.setScenario(value);
  scopes.clear();
  executionScopes.clear();
  void queryClient.cancelQueries();
  queryClient.clear();
  await executionJournal.clear();
}
