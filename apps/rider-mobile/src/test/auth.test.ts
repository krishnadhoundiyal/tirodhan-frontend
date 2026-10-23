import { authFlow } from '../features/auth';
import { riderAdmission } from '../session/admission';
import { SessionStore, type SessionSnapshot } from '../session/store';
import { Transport } from '../api/transport';
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
const principal = (roles: string[]): SessionSnapshot => ({
  status: 'authenticated',
  userId: 'rider',
  principal: { userId: 'rider', roles },
  principalState: 'available',
  principalError: null,
  ownerVersion: 1,
});
test.each([['RIDER'], ['CUSTOMER', 'RIDER']])(
  'live RIDER admission: %j',
  (...roles) => {
    expect(riderAdmission(principal(roles as string[]))).toBe('admitted');
  },
);
test.each([['CUSTOMER'], ['MANAGER'], [], ['rider']])(
  'non-RIDER principal denied: %j',
  (...roles) => {
    expect(riderAdmission(principal(roles as string[]))).toBe('forbidden');
  },
);
test('token without a confirmed live principal cannot enter any protected Rider route', () => {
  expect(
    riderAdmission({
      ...principal(['RIDER']),
      principal: null,
      principalState: 'unavailable',
    }),
  ).toBe('retry');
  expect(
    riderAdmission({ ...principal(['RIDER']), principalState: 'loading' }),
  ).toBe('loading');
});
test('OTP retries retain their own command identities and concurrent taps share a single request', async () => {
  const challenge = deferred<{ challenge_reference: string }>();
  const api = {
    startOtp: jest.fn().mockReturnValue(challenge.promise),
    verifyOtp: jest
      .fn()
      .mockRejectedValueOnce(new Error('Lost response'))
      .mockResolvedValue({}),
    refresh: jest.fn(),
    logout: jest.fn(),
  };
  const establish = jest.fn(async () => {});
  const uuid = jest
    .fn()
    .mockReturnValueOnce('start-key')
    .mockReturnValueOnce('verify-key');
  const flow = authFlow(api, { establish } as unknown as SessionStore, uuid);
  const first = flow.start('+919999999999'),
    second = flow.start('+919999999999');
  expect(first).toBe(second);
  challenge.resolve({ challenge_reference: 'challenge' });
  await first;
  await expect(flow.verify('123456')).rejects.toThrow();
  await flow.verify('123456');
  expect(api.verifyOtp.mock.calls[0]![0]).toEqual(
    api.verifyOtp.mock.calls[1]![0],
  );
  expect(api.verifyOtp.mock.calls[0]![0]).toEqual({
    client_login_id: 'verify-key',
    challenge_reference: 'challenge',
    code: '123456',
  });
  expect(establish).toHaveBeenCalledTimes(1);
});
test('cleared/replaced OTP challenge cannot establish a late session', async () => {
  const result = deferred<never>();
  const api = {
    startOtp: jest.fn().mockResolvedValue({ challenge_reference: 'challenge' }),
    verifyOtp: jest.fn().mockReturnValue(result.promise),
    refresh: jest.fn(),
    logout: jest.fn(),
  };
  const establish = jest.fn();
  const flow = authFlow(
    api,
    { establish } as unknown as SessionStore,
    () => 'uuid',
  );
  await flow.start('+919999999999');
  const verifying = flow.verify('123456');
  flow.clear();
  result.resolve({} as never);
  await verifying;
  expect(establish).not.toHaveBeenCalled();
});
test('late old-owner 401 cannot refresh or clear the replacement account', async () => {
  let identity = 1;
  const response = deferred<Response>();
  const session = {
    accessToken: () => (identity === 1 ? 'old' : 'new'),
    requestIdentity: () => identity,
    refresh: jest.fn(),
    clear: jest.fn(),
  };
  const transport = new Transport(
    'https://rider.example',
    session,
    () => '',
    jest.fn().mockReturnValue(response.promise),
  );
  const reading = transport.request('/v1/rider/me/assignment');
  identity = 2;
  response.resolve({ ok: false, status: 401 } as Response);
  await expect(reading).rejects.toMatchObject({ kind: 'cancelled' });
  expect(session.refresh).not.toHaveBeenCalled();
  expect(session.clear).not.toHaveBeenCalled();
});
test('old-owner success decoded after account switch is discarded', async () => {
  let identity = 1;
  const json = deferred<unknown>();
  const session = {
    accessToken: () => 'token',
    requestIdentity: () => identity,
    refresh: jest.fn(),
    clear: jest.fn(),
  };
  const transport = new Transport(
    'https://rider.example',
    session,
    () => '',
    jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: () => json.promise }),
  );
  const reading = transport.request('/v2/rider/route');
  await Promise.resolve();
  identity = 2;
  json.resolve({ private: 'old route' });
  await expect(reading).rejects.toMatchObject({ kind: 'cancelled' });
});
test('account switch clears scoped state and refresh cannot change the authenticated owner', async () => {
  const secure = {
    get: jest.fn(async () => 'refresh'),
    set: jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
  };
  const refresh = jest.fn().mockResolvedValue({
    access_token: 'new',
    user_id: 'other',
    expires_in: 60,
    token_type: 'bearer',
  });
  const clear = jest.fn();
  const store = new SessionStore(secure, refresh, clear);
  await store.establish({
    access_token: 'old',
    refresh_token: 'refresh',
    user_id: 'original',
    expires_in: 60,
    token_type: 'bearer',
  });
  await expect(store.refresh()).rejects.toThrow();
  expect(store.accessToken()).toBeNull();
  expect(clear).toHaveBeenCalled();
});
test('restart restores secure refresh and live RIDER principal without persisting access tokens', async () => {
  const secure = {
    get: jest.fn(async () => 'stable-refresh'),
    set: jest.fn(),
    remove: jest.fn(),
  };
  const token = {
    access_token: 'access-memory-only',
    user_id: 'rider',
    expires_in: 47,
    token_type: 'bearer',
  };
  const refresh = jest.fn(async () => token);
  const store = new SessionStore(secure, refresh, jest.fn(), {
    read: async () => ({ userId: 'rider', roles: ['RIDER'] }),
  });
  await store.bootstrap();
  expect(refresh).toHaveBeenCalledWith('stable-refresh');
  expect(riderAdmission(store.getSnapshot())).toBe('admitted');
  expect(secure.set).not.toHaveBeenCalled();
  expect(JSON.stringify(store.getSnapshot())).not.toContain(
    'access-memory-only',
  );
});
test('new login clears old state and a previous refresh cannot own the new refresh flight', async () => {
  const old = deferred<{
    access_token: string;
    user_id: string;
    expires_in: number;
    token_type: string;
  }>();
  const secure = {
    get: jest.fn(async () => 'secure'),
    set: jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
  };
  const token = (user_id: string) => ({
    access_token: `access-${user_id}`,
    user_id,
    expires_in: 60,
    token_type: 'bearer',
  });
  const request = jest
    .fn()
    .mockReturnValueOnce(old.promise)
    .mockResolvedValue(token('second'));
  const cleared = jest.fn();
  const store = new SessionStore(secure, request, cleared);
  await store.establish({ ...token('first'), refresh_token: 'first-refresh' });
  const firstRefresh = store.refresh();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await store.establish({
    ...token('second'),
    refresh_token: 'second-refresh',
  });
  await store.refresh();
  old.resolve(token('first'));
  await firstRefresh;
  expect(cleared).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot().userId).toBe('second');
  expect(store.accessToken()).toBe('access-second');
  expect(request).toHaveBeenCalledTimes(2);
});
test('logout clears memory immediately but captures its credential before secure removal', async () => {
  const read = deferred<string>();
  const removed = jest.fn(async () => {});
  const token = {
    access_token: 'access',
    user_id: 'rider',
    expires_in: 60,
    token_type: 'bearer',
    refresh_token: 'refresh',
  };
  const store = new SessionStore(
    { get: () => read.promise, set: async () => {}, remove: removed },
    jest.fn(),
    jest.fn(),
  );
  await store.establish(token);
  const clearing = store.clear(read.promise);
  expect(store.accessToken()).toBeNull();
  expect(store.getSnapshot().status).toBe('signedOut');
  await Promise.resolve();
  expect(removed).not.toHaveBeenCalled();
  read.resolve('refresh');
  await clearing;
  expect(removed).toHaveBeenCalledTimes(1);
});
