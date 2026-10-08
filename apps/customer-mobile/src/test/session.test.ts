import { SessionStore, type SecureCredential } from '../session/store';
import { Transport } from '../api/transport';
import { ApiError } from '../api/errors';
import { secureCredential } from '../session/secure';
import * as SecureStore from 'expo-secure-store';
const access = (token = 'new-access') => ({
  access_token: token,
  token_type: 'bearer',
  expires_in: 60,
  user_id: 'user-1',
});
const login = { ...access('old-access'), refresh_token: 'secure-refresh' };
function response(status: number, body: unknown = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function storage(): SecureCredential {
  let credential: string | null = null;
  return {
    get: jest.fn(async () => credential),
    set: jest.fn(async (value) => {
      credential = value;
    }),
    remove: jest.fn(async () => {
      credential = null;
    }),
  };
}
async function setup() {
  const secure = storage();
  const refresh = jest.fn(async () => access());
  const cleared = jest.fn();
  const session = new SessionStore(secure, refresh, cleared);
  await session.establish(login);
  return { secure, refresh, cleared, session };
}
test('one 401 refreshes and retries original protected request once', async () => {
  const { session, refresh } = await setup();
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(response(401))
    .mockResolvedValueOnce(response(200, { success: true }));
  const transport = new Transport(
    'https://api.example',
    session,
    () => 'uuid',
    fetcher,
  );
  expect(await transport.request('/v1/addresses')).toEqual({ success: true });
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0]![1].headers.Authorization).toBe(
    'Bearer old-access',
  );
  expect(fetcher.mock.calls[1]![1].headers.Authorization).toBe(
    'Bearer new-access',
  );
});
test('concurrent waiting requests share one refresh result', async () => {
  const { session, refresh } = await setup();
  const pending = deferred<ReturnType<typeof access>>();
  refresh.mockImplementation(() => pending.promise);
  const fetcher = jest.fn(async (_url: string, options: RequestInit) =>
    response(
      (options.headers as Record<string, string>).Authorization ===
        'Bearer old-access'
        ? 401
        : 200,
      ['ok'],
    ),
  );
  const transport = new Transport(
    'https://api.example',
    session,
    () => 'uuid',
    fetcher as typeof fetch,
  );
  const calls = Array.from({ length: 6 }, () =>
    transport.request('/v1/addresses'),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(refresh).toHaveBeenCalledTimes(1);
  pending.resolve(access());
  expect(await Promise.all(calls)).toEqual(Array(6).fill(['ok']));
  expect(fetcher).toHaveBeenCalledTimes(12);
});
test('a delayed 401 for an old token reuses the already refreshed token', async () => {
  const { session, refresh } = await setup();
  const delayed = deferred<Response>();
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(response(401))
    .mockImplementationOnce(() => delayed.promise)
    .mockResolvedValue(response(200));
  const transport = new Transport(
    'https://api.example',
    session,
    () => 'uuid',
    fetcher,
  );
  const first = transport.request('/first');
  const second = transport.request('/second');
  await first;
  delayed.resolve(response(401));
  await second;
  expect(refresh).toHaveBeenCalledTimes(1);
});
test('a retried 401 clears session and cannot loop', async () => {
  const { session, refresh, secure } = await setup();
  const fetcher = jest.fn().mockResolvedValue(response(401));
  await expect(
    new Transport(
      'https://api.example',
      session,
      () => 'uuid',
      fetcher,
    ).request('/protected'),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(secure.remove).toHaveBeenCalledTimes(1);
  expect(session.accessToken()).toBeNull();
});
test('403 never refreshes or signs the user out', async () => {
  const { session, refresh } = await setup();
  const fetcher = jest.fn().mockResolvedValue(response(403));
  await expect(
    new Transport(
      'https://api.example',
      session,
      () => 'uuid',
      fetcher,
    ).request('/protected'),
  ).rejects.toMatchObject({ status: 403 });
  expect(refresh).not.toHaveBeenCalled();
  expect(session.accessToken()).toBe('old-access');
});
test('refresh failure clears secure credential, memory and private cache', async () => {
  const { session, refresh, secure, cleared } = await setup();
  refresh.mockRejectedValue(new Error('failure'));
  await expect(
    new Transport(
      'https://api.example',
      session,
      () => 'uuid',
      jest.fn().mockResolvedValue(response(401)),
    ).request('/protected'),
  ).rejects.toBeInstanceOf(ApiError);
  expect(session.getSnapshot().status).toBe('signedOut');
  expect(await secure.get()).toBeNull();
  expect(cleared).toHaveBeenCalledTimes(1);
});
test('logout during refresh prevents a late response resurrecting the session', async () => {
  const { session, refresh } = await setup();
  const pending = deferred<ReturnType<typeof access>>();
  refresh.mockImplementation(() => pending.promise);
  const refreshing = session.refresh();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await session.clear();
  pending.resolve(access());
  await refreshing;
  expect(session.accessToken()).toBeNull();
  expect(session.getSnapshot().status).toBe('signedOut');
});
test('logout racing a secure write removes the late credential', async () => {
  const write = deferred<void>();
  let stored: string | null = null;
  const secure = {
    get: async () => stored,
    set: async (value: string) => {
      await write.promise;
      stored = value;
    },
    remove: async () => {
      stored = null;
    },
  };
  const session = new SessionStore(secure, async () => access(), jest.fn());
  const establishing = session.establish(login);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const clearing = session.clear();
  write.resolve();
  await Promise.all([establishing, clearing]);
  expect(stored).toBeNull();
  expect(session.accessToken()).toBeNull();
});
test('server expires_in controls expiration', async () => {
  const { session, refresh } = await setup();
  const now = jest.spyOn(Date, 'now');
  const start = Date.now();
  now.mockReturnValue(start + 59000);
  await session.renewIfExpired();
  expect(refresh).not.toHaveBeenCalled();
  now.mockReturnValue(start + 61000);
  await session.renewIfExpired();
  expect(refresh).toHaveBeenCalledTimes(1);
  now.mockRestore();
});
test('secure adapter persists only the refresh credential in OS SecureStore', async () => {
  await secureCredential.set('refresh-only');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    'tirodhan.customer.refresh',
    'refresh-only',
    { keychainAccessible: 5 },
  );
  await secureCredential.remove();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
    'tirodhan.customer.refresh',
  );
});
test('bootstrap without a refresh credential signs out', async () => {
  const refresh = jest.fn();
  const session = new SessionStore(storage(), refresh, jest.fn());
  await session.bootstrap();
  expect(session.getSnapshot().status).toBe('signedOut');
  expect(refresh).not.toHaveBeenCalled();
});
test('principal stays unknown unless a real principal reader supplies it', async () => {
  const { session } = await setup();
  expect(session.getSnapshot().principal).toBeNull();
  expect(JSON.stringify(session.getSnapshot())).not.toContain('access');
});
