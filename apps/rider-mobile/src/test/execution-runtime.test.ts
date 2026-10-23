import * as SecureStore from 'expo-secure-store';
jest.mock('expo-crypto', () => {
  let id = 0;
  return { randomUUID: () => `runtime-command-${++id}` };
});
const previousMode = process.env.EXPO_PUBLIC_RIDER_MODE;
const previousUrl = process.env.EXPO_PUBLIC_RIDER_API_BASE_URL;
let runtime: typeof import('../runtime');

test('preview collection receipt preserves evidence attribution before the completed assignment disappears', async () => {
  process.env.EXPO_PUBLIC_RIDER_MODE = 'SCREEN_PREVIEW';
  const fetcher = jest
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('No live calls expected'));
  jest.isolateModules(() => {
    runtime = jest.requireActual('../runtime');
  });
  await runtime.resetFixture('execution-v1');
  const execution = runtime.executionForSession();
  await execution.run({
    assignmentId: 'demo-assignment',
    source: 'RIDER_OFFER_ACCEPTED',
    kind: 'V1_START',
  });
  await execution.dismiss();
  await execution.run({
    assignmentId: 'demo-assignment',
    source: 'RIDER_OFFER_ACCEPTED',
    kind: 'V1_ATTEMPT',
    pickupId: 'demo-pickup',
    outcome: 'COLLECTED',
  });
  await execution.dismiss();
  expect(
    (await runtime.fixtures.repository.assignment()).assignment,
  ).toBeNull();
  const evidence = runtime.evidenceForSession();
  expect((await evidence.load()).work[0]).toMatchObject({
    pickupId: 'demo-pickup',
    mode: 'V1',
  });
  const capturedAt = new Date().toISOString();
  const local = await runtime
    .evidenceVault()
    .seal('fixture', 'PHOTO', capturedAt, () => {});
  const state = await evidence.begin(
    {
      kind: 'HANDOVER',
      id: 'fixture-handover',
      pickupId: 'demo-pickup',
      pointId: 'demo-receiving',
      location: { latitude: 0, longitude: 0 },
    },
    local,
  );
  expect(state.operation?.stage).toBe('FINALIZED');
  await runtime.logout();
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.doMock('expo-secure-store', () => SecureStore);
  process.env.EXPO_PUBLIC_RIDER_API_BASE_URL = 'https://rider.example';
});
afterEach(async () => {
  if (runtime) {
    await runtime.queryClient.cancelQueries();
    runtime.queryClient.clear();
  }
  if (previousMode === undefined) delete process.env.EXPO_PUBLIC_RIDER_MODE;
  else process.env.EXPO_PUBLIC_RIDER_MODE = previousMode;
  if (previousUrl === undefined)
    delete process.env.EXPO_PUBLIC_RIDER_API_BASE_URL;
  else process.env.EXPO_PUBLIC_RIDER_API_BASE_URL = previousUrl;
  jest.restoreAllMocks();
});
test('real preview composition uses neither native secure recovery nor live execution transport', async () => {
  process.env.EXPO_PUBLIC_RIDER_MODE = 'SCREEN_PREVIEW';
  const fetcher = jest
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('No live calls expected'));
  jest.isolateModules(() => {
    runtime = jest.requireActual('../runtime');
  });
  await runtime.resetFixture('execution-v1');
  const service = runtime.executionForSession();
  await service.run({
    assignmentId: 'demo-assignment',
    source: 'RIDER_OFFER_ACCEPTED',
    kind: 'V1_START',
  });
  expect((await service.load())?.status).toBe('confirmed');
  await runtime.logout();
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockRestore();
});
test('real live composition seals command before submission and never uses fixture execution', async () => {
  process.env.EXPO_PUBLIC_RIDER_MODE = 'LIVE';
  const store = new Map<string, string>();
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async (key) => store.get(key) ?? null);
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      store.set(key, value);
    });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    store.delete(key);
  });
  const date = new Date().toISOString();
  const assignment = {
    assignment_id: 'live-assignment',
    collection_group_id: 'live-group',
    source: 'MANAGER_ASSIGNED',
    status: 'ACTIVE',
    assigned_at: date,
    started_at: null,
    completed_at: null,
    pickups: [],
  };
  const fetcher = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (input) => {
      const url = String(input);
      let value: unknown;
      if (url.endsWith('/v1/auth/me'))
        value = { user_id: 'live-rider', roles: ['RIDER'] };
      else if (url.endsWith('/v1/rider/me/assignment')) value = { assignment };
      else if (url.endsWith('/v2/rider/route')) value = null;
      else if (url.endsWith('/v1/rider/me/availability'))
        value = {
          rider_id: 'live-rider',
          availability_intent: 'AVAILABLE',
          work_state: 'RESERVED',
          version: 1,
          updated_at: date,
        };
      else if (url.endsWith('/v1/rider/me/offers')) value = [];
      else if (url.endsWith('/v1/rider/assignments/live-assignment/start')) {
        expect(
          JSON.parse(store.get('tirodhan.rider.execution.v1')!).status,
        ).toBe('prepared');
        value = { ...assignment, rider_id: 'live-rider', started_at: date };
      } else throw new Error('Unexpected test endpoint');
      return { ok: true, status: 200, json: async () => value } as Response;
    });
  jest.isolateModules(() => {
    runtime = jest.requireActual('../runtime');
  });
  const fixtureSend = jest.spyOn(runtime.fixtures.execution, 'send');
  await runtime.session.establish({
    user_id: 'live-rider',
    access_token: 'access-memory',
    refresh_token: 'secure-only-refresh',
    token_type: 'bearer',
    expires_in: 60,
  });
  const result = await runtime.executionForSession().run({
    assignmentId: 'live-assignment',
    source: 'MANAGER_ASSIGNED',
    kind: 'V1_START',
  });
  expect(result?.status).toBe('confirmed');
  expect(fixtureSend).not.toHaveBeenCalled();
  const sealed = store.get('tirodhan.rider.execution.v1')!;
  expect(sealed).not.toContain('secure-only-refresh');
  expect(sealed).not.toContain('access-memory');
  expect(sealed).not.toContain('latitude');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    'tirodhan.rider.execution.v1',
    expect.any(String),
    { keychainAccessible: 5 },
  );
  const revoke = jest
    .spyOn(runtime.authApi, 'logout')
    .mockResolvedValue(undefined);
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    if (key === 'tirodhan.rider.execution.v1')
      throw new Error('secure removal failed');
    store.delete(key);
  });
  await expect(runtime.logout()).rejects.toMatchObject({
    kind: 'configuration',
  });
  expect(runtime.session.accessToken()).toBeNull();
  expect(revoke).toHaveBeenCalledWith('secure-only-refresh');
  fetcher.mockRestore();
});
