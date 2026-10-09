import * as SecureStore from 'expo-secure-store';
import { authFlow } from '../features/auth/flow';
import { productAdmission } from '../session/admission';

let mockExpoGo = true;
jest.mock('expo', () => ({ isRunningInExpoGo: () => mockExpoGo }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'test-command-id' }));

const modeGlobal = globalThis as typeof globalThis & {
  __tirodhanCustomerModeLock?: { mode?: string };
};
const savedEnv = { ...process.env };
let fetchSpy: jest.SpiedFunction<typeof fetch>;
function load(mode: string | undefined) {
  if (mode === undefined) delete process.env.EXPO_PUBLIC_APP_MODE;
  else process.env.EXPO_PUBLIC_APP_MODE = mode;
  let runtime!: typeof import('../lib/runtime');
  let api!: (typeof import('../api'))['api'];
  let composition!: typeof import('../lib/repositories');
  let navigation!: typeof import('../lib/navigation');
  jest.isolateModules(() => {
    runtime =
      jest.requireActual<typeof import('../lib/runtime')>('../lib/runtime');
    api = jest.requireActual<typeof import('../api')>('../api').api;
    composition = jest.requireActual<typeof import('../lib/repositories')>(
      '../lib/repositories',
    );
    navigation =
      jest.requireActual<typeof import('../lib/navigation')>(
        '../lib/navigation',
      );
  });
  return { ...runtime, api, ...composition, ...navigation };
}
beforeEach(() => {
  delete modeGlobal.__tirodhanCustomerModeLock;
  mockExpoGo = true;
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://nonprod.test';
  process.env.EXPO_PUBLIC_PREVIEW_CATALOGUE = 'true';
  // Exercise enabled API gates too: isolation must not depend on an absent capability.
  process.env.EXPO_PUBLIC_CUSTOMER_CAPABILITIES =
    'principal,collections,payment,checkout,refunds,profile,push';
  jest.clearAllMocks();
  jest
    .mocked(SecureStore.getItemAsync)
    .mockResolvedValue('pre-existing-refresh');
  fetchSpy = jest
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('No backend'));
});
afterEach(() => {
  delete modeGlobal.__tirodhanCustomerModeLock;
  process.env = { ...savedEnv };
  jest.restoreAllMocks();
});
const expectNoCredentials = () => {
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
};
test('preview startup, foreground renewal and logout never consume or modify an existing credential', async () => {
  const app = load('SCREEN_PREVIEW');
  const bootstrap = jest.spyOn(app.session, 'bootstrap');
  const refresh = jest.spyOn(app.session, 'refresh');
  const principal = jest.spyOn(app.customerApi, 'principal');
  const clear = jest.spyOn(app.session, 'clear');
  await app.navigationSession.bootstrap();
  await app.navigationSession.renewIfExpired();
  await app.navigationSession.loadPrincipal();
  expect(app.navigationOwner(app.navigationSession.getSnapshot())).toBe(
    'screen-preview:synthetic-navigation-only',
  );
  expect(app.session.accessToken()).toBeNull();
  expect(app.navigationSession.getSnapshot().userId).toBeNull();
  expect(app.repositories.source).toBe('development');
  await app.repositories.addresses();
  await app.repositories.catalogue();
  await app.logout();
  expect(bootstrap).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
  expect(principal).not.toHaveBeenCalled();
  expect(clear).not.toHaveBeenCalled();
  expectNoCredentials();
  expect(fetchSpy).not.toHaveBeenCalled();
  app.queryClient.clear();
});
test('even an accidental real-session establishment is rejected before credential persistence or admission', async () => {
  const app = load('SCREEN_PREVIEW');
  await expect(
    app.session.establish({
      access_token: 'not-a-preview-token',
      refresh_token: 'not-a-preview-credential',
      token_type: 'bearer',
      expires_in: 60,
      user_id: 'real-user',
    }),
  ).rejects.toMatchObject({ kind: 'preview' });
  expect(app.session.accessToken()).toBeNull();
  expect(app.session.getSnapshot().userId).toBeNull();
  expectNoCredentials();
  expect(fetchSpy).not.toHaveBeenCalled();
});
test('public OTP, principal, checkout, refund and all HTTP methods are blocked before fetch', async () => {
  const app = load('SCREEN_PREVIEW');
  const calls = [
    app.api.startOtp({ phone: '+919999999999', client_request_id: 'id' }),
    app.api.verifyOtp({
      challenge_reference: 'challenge',
      code: '123456',
      client_login_id: 'id',
    }),
    app.customerApi.principal(),
    app.api.addresses(),
    app.customerApi.checkout('attempt'),
    app.customerApi.refunds('collection'),
    ...(['GET', 'POST', 'PUT', 'DELETE'] as const).map((method) =>
      app.transport.request('/v1/any-customer-endpoint', {
        method,
        authenticated: false,
      }),
    ),
    app.api.cancelCollection('collection').execute(),
    app.api.paymentAttempt('collection').execute(),
    app.transport
      .command('/v1/collection-requests', { method: 'POST', body: {} })
      .execute(),
    app.transport
      .command('/v1/auth/refresh', {
        method: 'POST',
        authenticated: false,
        body: {},
      })
      .execute(),
    app.transport
      .command('/v1/customer/me/profile', { method: 'PUT', body: {} })
      .execute(),
    app.transport
      .command('/v1/customer/push-registration', { method: 'POST', body: {} })
      .execute(),
  ];
  const results = await Promise.allSettled(calls);
  expect(
    results.every(
      (result) =>
        result.status === 'rejected' && result.reason.kind === 'preview',
    ),
  ).toBe(true);
  expect(fetchSpy).not.toHaveBeenCalled();
  expectNoCredentials();
});
test.each(['NONPROD', undefined])(
  '%s ignores the deprecated flag and uses the normal session and repositories',
  (mode) => {
    const app = load(mode);
    expect(app.previewCatalogue).toBe(false);
    expect(app.repositories.source).toBe('backend');
    expect(app.navigationSession).toBe(app.session);
    expect(app.navigationOwner(app.session.getSnapshot())).toBe('signed-out');
    expect(app.hasCustomerCapability('cancellationCompensation')).toBe(false);
    expect(
      productAdmission(
        { ...app.session.getSnapshot(), status: 'signedOut' },
        app.previewCatalogue,
      ),
    ).toBe('login');
  },
);
test('NONPROD performs real OTP, secure persistence, refresh, principal admission and logout', async () => {
  const app = load('NONPROD');
  const tokens = {
    access_token: 'backend-access',
    refresh_token: 'backend-refresh',
    token_type: 'bearer',
    expires_in: 120,
    user_id: 'backend-customer',
  };
  fetchSpy.mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    const body = path.endsWith('/otp/start')
      ? { challenge_reference: 'backend-challenge' }
      : path.endsWith('/me')
        ? { user_id: 'backend-customer', roles: ['CUSTOMER'] }
        : path.endsWith('/refresh')
          ? { ...tokens, access_token: 'renewed-access' }
          : path.endsWith('/logout')
            ? {}
            : tokens;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const flow = authFlow(app.api, app.session, () => 'command');
  expect(await flow.start('+919999999999')).toEqual({
    challenge_reference: 'backend-challenge',
  });
  await flow.verify('backend-challenge', '123456');
  expect(app.session.accessToken()).toBe('backend-access');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    'tirodhan.customer.refresh',
    'backend-refresh',
    expect.any(Object),
  );
  expect(productAdmission(app.session.getSnapshot(), false)).toBe('admitted');
  await app.session.refresh();
  expect(app.session.accessToken()).toBe('renewed-access');
  expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual(
    expect.arrayContaining([
      'https://nonprod.test/v1/auth/otp/start',
      'https://nonprod.test/v1/auth/otp/verify',
      'https://nonprod.test/v1/auth/me',
      'https://nonprod.test/v1/auth/refresh',
    ]),
  );
  await app.logout();
  expect(app.session.getSnapshot().status).toBe('signedOut');
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(
    'tirodhan.customer.refresh',
  );
  app.queryClient.clear();
});
test('NONPROD surfaces backend failure without fixture fallback', async () => {
  const app = load('NONPROD');
  jest.spyOn(app.session, 'accessToken').mockReturnValue('backend-access');
  await expect(app.repositories.addresses()).rejects.toMatchObject({
    kind: 'network',
  });
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(app.repositories.source).toBe('backend');
});
test('mode changes in the same JS runtime are rejected, invalid configuration cannot compose a bypass', () => {
  load('SCREEN_PREVIEW');
  expect(() => load('NONPROD')).toThrow('Fully restart');
  delete modeGlobal.__tirodhanCustomerModeLock;
  expect(() => load('typo')).toThrow('Invalid EXPO_PUBLIC_APP_MODE');
  mockExpoGo = false;
  expect(() => load('SCREEN_PREVIEW')).toThrow(
    'requires a development bundle in Expo Go',
  );
  expectNoCredentials();
  expect(fetchSpy).not.toHaveBeenCalled();
});
