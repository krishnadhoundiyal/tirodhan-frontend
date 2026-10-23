import { QueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { AppState, Platform } from 'react-native';
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
import { createEvidenceApi } from './api/evidence-client';
import {
  createEvidenceService,
  type EvidenceService,
} from './features/evidence/service';
import { nativeEvidenceStore } from './session/evidence';
import { memoryEvidenceStore } from './features/evidence/store';
import { nativeVault } from './features/evidence/vault';
import { createBlobUploader } from './features/evidence/upload';
import { createFieldFixtures } from './features/evidence/fixtures';
import type { AssignmentEnvelope, Route } from './api/contracts';
import { createPushApi } from './api/push-client';
import { createPushLifecycle } from './notifications/lifecycle';
import { nativeInstallation } from './notifications/installation';
import { loadNativePush } from './notifications/native';
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
const evidenceScopes = new Map<string, EvidenceService>();
let fixtureGeneration = 0;
let evidenceCleanup: Promise<unknown> = Promise.resolve();
export const executionJournal = preview
  ? memoryJournal()
  : nativeExecutionJournal;
export const evidenceStore = preview
  ? memoryEvidenceStore()
  : nativeEvidenceStore;
export const session = new SessionStore(
  secureCredential,
  (credential) => authApi.refresh(credential),
  () => {
    void queryClient.cancelQueries();
    queryClient.clear();
    scopes.clear();
    executionScopes.clear();
    for (const service of evidenceScopes.values()) service.suspend();
    evidenceScopes.clear();
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
const liveEvidenceApi = createEvidenceApi(liveTransport);
const livePushApi = createPushApi(liveTransport);
export const pushNotifications = createPushLifecycle({
  context: () => ({
    state: session.getSnapshot(),
    identity: session.requestIdentity(),
    api: livePushApi,
    refresh: () => operationsForSession().refresh(),
  }),
  active: () => !preview && nativeAuth && AppState.currentState === 'active',
  native: () => (preview ? null : loadNativePush()),
  store: nativeInstallation,
});
export const fixtures = createFixtureRepository();
let fieldFixtures = createFieldFixtures(fixtures.fieldProgress);
export const repository = repositoryForMode(mode, liveApi, fixtures.repository);
export const auth = authFlow(authApi, session, randomUUID);
let lastOwner: string | null = null;
session.subscribe(() => {
  if (!preview && nativeAuth) pushNotifications.changed();
  const owner = session.getSnapshot().userId;
  if (owner && lastOwner && owner !== lastOwner) {
    void executionJournal.clear().catch(() => {});
    void clearEvidence().catch(() => {});
  }
  if (owner) lastOwner = owner;
});
export async function recheckSession() {
  await session.renewIfExpired();
  await session.loadPrincipal();
  if (!preview && nativeAuth) await pushNotifications.foreground();
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
    await clearEvidence();
    auth.clear();
    return;
  }
  // Revoke while the current Rider credential is still usable. A native operation
  // can outlive this UI deadline; its serialized reset obligation gates the next owner.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      pushNotifications.logout(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 15000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  const credential = secureCredential.get().catch(() => null);
  auth.clear();
  await session.clear(credential);
  const cleanup = await Promise.allSettled([
    executionJournal.clear(),
    clearEvidence(),
  ]);
  const journalClearFailed = cleanup.some(
    (result) => result.status === 'rejected',
  );
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
      async (command) => {
        if (Platform.OS === 'web' && !preview) return;
        const service = evidenceForSession();
        if (command.kind === 'V1_ATTEMPT' && command.outcome === 'COLLECTED')
          await service.remember(command.pickupId, command.assignmentId, 'V1');
        if (
          command.kind === 'V2_TASK' &&
          command.operation === 'PICKUP' &&
          command.outcome === 'COLLECTED'
        ) {
          let route = queryClient.getQueryData<Route | null>(
            operations.key('route'),
          );
          if (!route)
            route = await queryClient.fetchQuery(operations.query('route'));
          const pickupId = route?.tasks.find(
            (t) => t.task_id === command.taskId,
          )?.pickup_execution_id;
          if (pickupId)
            await service.remember(pickupId, command.assignmentId, 'V2');
          else throw new ApiError(0, 'configuration');
        }
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
  await clearEvidence();
  fieldFixtures = createFieldFixtures(fixtures.fieldProgress);
}
function clearEvidence() {
  for (const service of evidenceScopes.values()) service.suspend();
  evidenceScopes.clear();
  evidenceCleanup = evidenceCleanup
    .catch(() => {})
    .then(async () => {
      await evidenceStore.clear();
      if (preview) await fieldFixtures.vault.sweep(null);
      else if (Platform.OS !== 'web') await nativeVault.sweep(null);
    });
  return evidenceCleanup;
}
export function evidenceForSession() {
  const state = session.getSnapshot(),
    identity = session.requestIdentity(),
    epoch = fixtureGeneration;
  const owner = preview ? fixtureOwner : state.userId,
    operations = operationsForSession();
  if (!owner) throw new ApiError(403);
  const key = [
      'rider-field-evidence',
      ...operations.key('assignment').slice(0, -1),
    ],
    name = JSON.stringify(key);
  let service = evidenceScopes.get(name);
  if (!service) {
    const current = () =>
      preview
        ? fixtureGeneration === epoch
        : session.requestIdentity() === identity &&
          session.getSnapshot().userId === owner &&
          riderAdmission(session.getSnapshot()) === 'admitted';
    service = createEvidenceService(
      preview ? fieldFixtures.api : liveEvidenceApi,
      evidenceStore,
      preview ? fieldFixtures.vault : nativeVault,
      preview ? fieldFixtures.upload : createBlobUploader(),
      {
        owner,
        current,
        ready: () => evidenceCleanup,
        uuid: randomUUID,
        fresh: async () => {
          await Promise.all(
            (['assignment', 'route', 'availability'] as const).map((resource) =>
              queryClient.cancelQueries({
                queryKey: operations.key(resource),
                exact: true,
              }),
            ),
          );
          const [assignment, route] = await Promise.all([
            queryClient.fetchQuery(operations.query('assignment')),
            queryClient.fetchQuery(operations.query('route')),
            queryClient.fetchQuery(operations.query('availability')),
          ]);
          if (!current()) throw new ApiError(0, 'cancelled');
          return {
            assignment: (assignment as AssignmentEnvelope).assignment,
            route,
          };
        },
        executionPending: async () =>
          !!(await executionJournal.load(owner, () => {
            if (!current()) throw new ApiError(0, 'cancelled');
          })),
        refresh: async () => {
          await operations.refresh();
          if (current())
            await queryClient.invalidateQueries({ queryKey: key, exact: true });
        },
      },
    );
    evidenceScopes.set(name, service);
  }
  return service;
}
export function evidenceVault() {
  const vault = preview ? fieldFixtures.vault : nativeVault;
  return {
    ...vault,
    seal: async (...args: Parameters<typeof vault.seal>) => {
      await evidenceCleanup;
      return vault.seal(...args);
    },
  };
}
