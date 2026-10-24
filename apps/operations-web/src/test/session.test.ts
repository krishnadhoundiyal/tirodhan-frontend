import { ManagerSession, unavailableAdapter, ReadError } from '../auth/session';
import { createRuntime } from '../runtime';
import { fixtureId } from '../preview/fixtures';
import { access, deferred, harness, response, user } from './helpers';

test.each([
  { roles: ['CUSTOMER'] },
  { roles: ['RIDER'] },
  { roles: [] },
  { roles: ['manager'] },
])('denies a non-MANAGER principal %j', async ({ roles }) => {
  const { session } = harness(roles);
  await session.restore();
  expect(session.snapshot().phase).toBe('denied');
  await expect(session.read('/v1/manager/riders')).rejects.toMatchObject({
    kind: 'unauthorized',
  });
});
test('OTP boundary admits only after a live principal read and never exposes grants', async () => {
  const { session, adapter, fetcher } = harness();
  const challenge = await session.startOtp({
    client_request_id: fixtureId(80),
    phone: '+919999999999',
  });
  expect(session.snapshot().phase).toBe('signedOut');
  await session.verifyOtp({
    client_login_id: fixtureId(81),
    challenge_reference: challenge,
    code: '123456',
  });
  expect(adapter.verifyOtp).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('https://gateway.example/v1/auth/me');
  expect(session.snapshot()).toMatchObject({
    phase: 'ready',
    principal: { user_id: user, roles: ['MANAGER'] },
  });
  expect(JSON.stringify(session.snapshot())).not.toMatch(
    /private-access|123456|9999999999/,
  );
});
test('unverified production composition never calls auth or business endpoints', async () => {
  const fetcher = jest.fn();
  const session = new ManagerSession(
    unavailableAdapter,
    'https://gateway.example',
    fetcher,
  );
  await session.restore();
  await expect(session.read('/v1/manager/riders')).rejects.toMatchObject({
    kind: 'unavailable',
  });
  expect(session.snapshot().phase).toBe('unavailable');
  expect(fetcher).not.toHaveBeenCalled();
});
test.each([
  'http://gateway.example',
  'https://user:secret@gateway.example',
  'https://gateway.example/path',
  'https://gateway.example/',
])('rejects unsafe gateway origin %s', (origin) => {
  expect(
    () => new ManagerSession(unavailableAdapter, origin, jest.fn()),
  ).toThrow();
});
test.each([
  { ...access(), refresh_token: 'must-never-be-exposed' },
  { ...access(), token_type: 'Basic' },
  { ...access(), expires_in: 0 },
  { ...access(), expires_in: '3600' },
  { ...access(), access_token: '' },
])('fails closed on an unsafe grant %j', async (value) => {
  const { session, adapter } = harness();
  adapter.refresh.mockResolvedValue(value);
  await session.restore();
  expect(session.snapshot().phase).toBe('error');
  expect(session.snapshot().principal).toBeNull();
});
test('rejects a grant/principal identity mismatch', async () => {
  const { session, fetcher } = harness();
  fetcher.mockResolvedValue(
    response({ user_id: fixtureId(88), roles: ['MANAGER'] }),
  );
  await session.restore();
  expect(session.snapshot().phase).toBe('error');
});
test('concurrent 401s coordinate refresh, recheck current role and retry once', async () => {
  const { session, adapter, fetcher } = harness();
  await session.restore();
  const refresh = deferred<ReturnType<typeof access>>();
  adapter.refresh.mockImplementation(() => refresh.promise);
  fetcher.mockImplementation(async (input, init) =>
    String(input).endsWith('/v1/auth/me')
      ? response({ user_id: user, roles: ['MANAGER'] })
      : (init?.headers as Record<string, string>).Authorization ===
          'Bearer private-access-one'
        ? response(null, 401)
        : response([]),
  );
  const a = session.read('/v1/manager/riders'),
    b = session.read('/v1/manager/incidents');
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(adapter.refresh).toHaveBeenCalledTimes(2); // bootstrap + one shared refresh
  refresh.resolve(access('private-access-two'));
  await expect(Promise.all([a, b])).resolves.toEqual([[], []]);
  expect(adapter.refresh).toHaveBeenCalledTimes(2);
  expect(
    fetcher.mock.calls.filter(([url]) => String(url).endsWith('/v1/auth/me')),
  ).toHaveLength(2);
});
test('a delayed old-token 401 reuses the already refreshed grant', async () => {
  const { session, adapter, fetcher } = harness();
  await session.restore();
  const slow = deferred<Response>();
  adapter.refresh.mockResolvedValue(access('new-access'));
  fetcher.mockImplementation(async (input, init) => {
    if (String(input).endsWith('/v1/auth/me'))
      return response({ user_id: user, roles: ['MANAGER'] });
    if (
      (init?.headers as Record<string, string>).Authorization ===
      'Bearer new-access'
    )
      return response([]);
    return String(input).endsWith('/incidents')
      ? slow.promise
      : response(null, 401);
  });
  const a = session.read('/v1/manager/incidents');
  await session.read('/v1/manager/riders');
  slow.resolve(response(null, 401));
  await a;
  expect(adapter.refresh).toHaveBeenCalledTimes(2);
});
test('403 never refreshes, clears operational state and denies admission', async () => {
  const { session, adapter, fetcher } = harness();
  await session.restore();
  const runtime = createRuntime('verified-adapter', session, {
    dispatch: true,
    fleet: true,
    orchestration: true,
  });
  runtime.queries.setQueryData(
    ['manager', session.snapshot().epoch, 'private'],
    ['old-manager-record'],
  );
  fetcher.mockResolvedValue(
    response({ detail: 'raw household phone 12345' }, 403),
  );
  await expect(session.read('/v1/manager/riders')).rejects.toMatchObject({
    kind: 'forbidden',
  });
  expect(adapter.refresh).toHaveBeenCalledTimes(1);
  expect(session.snapshot().phase).toBe('denied');
  expect(runtime.queries.getQueryCache().getAll()).toHaveLength(0);
  runtime.dispose();
});
test('second 401 ends the session without another refresh', async () => {
  const { session, adapter, fetcher } = harness();
  await session.restore();
  fetcher.mockImplementation(async (input) =>
    String(input).endsWith('/v1/auth/me')
      ? response({ user_id: user, roles: ['MANAGER'] })
      : response(null, 401),
  );
  await expect(session.read('/v1/manager/riders')).rejects.toMatchObject({
    kind: 'unauthorized',
  });
  expect(adapter.refresh).toHaveBeenCalledTimes(2);
  expect(session.snapshot().phase).toBe('signedOut');
});
test('refresh cannot switch accounts or retain a revoked MANAGER role', async () => {
  for (const differentAccount of [false, true]) {
    const { session, adapter, fetcher } = harness();
    await session.restore();
    adapter.refresh.mockResolvedValue(
      access('new', differentAccount ? fixtureId(88) : user),
    );
    fetcher.mockImplementation(async (input) =>
      String(input).endsWith('/v1/auth/me')
        ? response({ user_id: user, roles: ['CUSTOMER'] })
        : response(null, 401),
    );
    await expect(session.read('/v1/manager/riders')).rejects.toBeDefined();
    expect(session.snapshot().principal).toBeNull();
    expect(session.snapshot().phase).not.toBe('ready');
  }
});
test('logout cancels an ignored-signal response and removes the token and cache', async () => {
  const { session, fetcher } = harness();
  await session.restore();
  const runtime = createRuntime('verified-adapter', session, {
    dispatch: true,
    fleet: true,
    orchestration: true,
  });
  const pending = deferred<Response>();
  let requestSignal: AbortSignal | undefined;
  fetcher.mockImplementation(async (_, init) => {
    requestSignal = init?.signal ?? undefined;
    return pending.promise;
  });
  runtime.queries.setQueryData(['manager', 'old'], ['old-data']);
  const read = session.read('/v1/manager/riders');
  const rejected = expect(read).rejects.toMatchObject({ kind: 'cancelled' });
  await Promise.resolve();
  await session.logout();
  pending.resolve(response(['late private record']));
  await rejected;
  expect(requestSignal?.aborted).toBe(true);
  expect(session.snapshot().principal).toBeNull();
  expect(runtime.queries.getQueryCache().getAll()).toHaveLength(0);
  runtime.dispose();
});
test('external cancellation rejects without presenting a late response', async () => {
  const { session, fetcher } = harness();
  await session.restore();
  const pending = deferred<Response>();
  fetcher.mockImplementation(() => pending.promise);
  const controller = new AbortController();
  const read = session.read('/v1/manager/riders', controller.signal);
  const rejected = expect(read).rejects.toMatchObject({ kind: 'cancelled' });
  controller.abort();
  pending.resolve(response(['late']));
  await rejected;
});
test('finite deadline bounds an adapter and an operational read that ignore abort', async () => {
  const { session, adapter, fetcher } = harness(['MANAGER'], 25);
  await session.restore();
  fetcher.mockImplementation(() => new Promise(() => {}));
  await expect(session.read('/v1/manager/riders')).rejects.toMatchObject({
    kind: 'unavailable',
  });
  adapter.refresh.mockImplementation(() => new Promise(() => {}));
  await session.restore();
  expect(session.snapshot().phase).toBe('error');
});
test('unconfirmed remote logout blocks login until successful logout retry', async () => {
  const { session, adapter } = harness();
  await session.restore();
  adapter.logout.mockRejectedValueOnce(new Error('raw credential error'));
  await session.logout();
  expect(session.snapshot().logoutUnconfirmed).toBe(true);
  await expect(
    session.startOtp({
      phone: '+919999999999',
      client_request_id: fixtureId(90),
    }),
  ).rejects.toMatchObject({ kind: 'unauthorized' });
  await session.logout();
  expect(session.snapshot().logoutUnconfirmed).toBe(false);
  expect(JSON.stringify(session.snapshot())).not.toContain('raw credential');
});
test('an explicit new login clears prior ownership before admitting a different manager', async () => {
  const { session, adapter, fetcher } = harness();
  await session.restore();
  const oldEpoch = session.snapshot().epoch;
  const newUser = fixtureId(88);
  adapter.verifyOtp.mockResolvedValue(access('other-manager-access', newUser));
  fetcher.mockResolvedValue(response({ user_id: newUser, roles: ['MANAGER'] }));
  await session.startOtp({
    client_request_id: fixtureId(90),
    phone: '+919999999999',
  });
  expect(session.snapshot().principal).toBeNull();
  expect(session.snapshot().epoch).toBeGreaterThan(oldEpoch);
  await session.verifyOtp({
    client_login_id: fixtureId(91),
    challenge_reference: fixtureId(90),
    code: '123456',
  });
  expect(session.snapshot().principal?.user_id).toBe(newUser);
});
test('transport sends only bearer GET reads, no cookies, role headers or operational writes', async () => {
  const { session, fetcher } = harness();
  await session.restore();
  await session.read('/v1/manager/riders?limit=100');
  for (const [, init] of fetcher.mock.calls) {
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    expect(Object.keys(init?.headers ?? {}).sort()).toEqual([
      'Accept',
      'Authorization',
    ]);
    expect(init).not.toHaveProperty('body');
  }
  for (const path of [
    '/v2/manager/operations',
    '/v2/manager/routes/activate',
    '/v1/manager/fleets',
    'https://evil.example/v1/manager/riders',
    '/v1/auth/refresh',
  ])
    await expect(session.read(path)).rejects.toBeInstanceOf(ReadError);
});
test('access expiry uses the server lifetime and refreshes before a subsequent read', async () => {
  const { session, adapter } = harness();
  adapter.refresh
    .mockResolvedValueOnce(access('short-lived', user, 1))
    .mockResolvedValue(access('renewed'));
  await session.restore();
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 2000);
  try {
    await session.read('/v1/manager/riders');
    expect(adapter.refresh).toHaveBeenCalledTimes(2);
  } finally {
    clock.mockRestore();
  }
});
test('pre-read expiry refresh and a subsequent 401 cannot cause two refreshes in one read', async () => {
  const { session, adapter, fetcher } = harness();
  adapter.refresh
    .mockResolvedValueOnce(access('short-lived', user, 1))
    .mockResolvedValue(access('renewed'));
  await session.restore();
  const now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 2000);
  fetcher.mockImplementation(async (input) =>
    String(input).endsWith('/v1/auth/me')
      ? response({ user_id: user, roles: ['MANAGER'] })
      : response(null, 401),
  );
  try {
    await expect(session.read('/v1/manager/riders')).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    expect(adapter.refresh).toHaveBeenCalledTimes(2);
  } finally {
    clock.mockRestore();
  }
});
test('one caller can cancel while a shared refresh continues for another caller', async () => {
  const { session, adapter, fetcher } = harness();
  await session.restore();
  const refresh = deferred<unknown>();
  adapter.refresh.mockImplementation(() => refresh.promise);
  fetcher.mockImplementation(async (input, options) =>
    String(input).endsWith('/v1/auth/me')
      ? response({ user_id: user, roles: ['MANAGER'] })
      : (options?.headers as Record<string, string>).Authorization ===
          'Bearer renewed'
        ? response([])
        : response(null, 401),
  );
  const abort = new AbortController();
  const a = session.read('/v1/manager/riders', abort.signal);
  const rejected = expect(a).rejects.toMatchObject({ kind: 'cancelled' });
  const b = session.read('/v1/manager/incidents');
  await new Promise((resolve) => setTimeout(resolve, 0));
  abort.abort();
  await rejected;
  refresh.resolve(access('renewed'));
  await expect(b).resolves.toEqual([]);
  expect(adapter.refresh).toHaveBeenCalledTimes(2);
});
