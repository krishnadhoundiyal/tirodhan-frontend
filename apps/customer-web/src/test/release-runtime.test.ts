import { releaseRuntime } from '../runtime';

const browser = 'https://customer.release-test.invalid';
const gateway = 'https://gateway.release-test.invalid';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const challenge = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const config = {
  approved: true,
  approvalReference: 'synthetic-only',
  environment: 'nonprod',
  product: 'customer',
  browserOrigin: browser,
  gatewayOrigin: gateway,
  routes: {
    start: '/web/start',
    verify: '/web/verify',
    refresh: '/web/refresh',
    logout: '/web/logout',
  },
  csrf: { header: 'X-Web-Test-Session', value: 'test' },
};
const protectedPath = '/v1/addresses';
const json = (body: unknown, status = 200) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;
function harness(
  configuration: unknown = config,
  roles = ['CUSTOMER'],
  features: unknown = null,
) {
  let cookie = false;
  let refreshes = 0;
  let expired = false;
  let loseVerify = false;
  const lockNames = new Set<string>();
  const locks = {
    request: async <T>(
      name: string,
      _options: unknown,
      work: () => Promise<T>,
    ) => {
      lockNames.add(name);
      return work();
    },
  } as LockManager;
  const grant = (token: string) => ({
    access_token: token,
    token_type: 'bearer',
    user_id: owner,
    expires_in: 3600,
  });
  const fetcher = jest.fn(
    async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      expect(headers.has('x-gateway-secret')).toBe(false);
      if (url.origin === browser) {
        if (url.pathname === '/web-customer-features.json')
          return json(features);
        if (url.pathname === '/web-checkout-config.json') return json(null);
        expect(url.pathname).toBe('/web-session-config.json');
        expect(init).toMatchObject({
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
        });
        return json(configuration);
      }
      expect(url.origin).toBe(gateway);
      if (url.pathname.startsWith('/web/')) {
        expect(headers.get(config.csrf.header)).toBe('test');
        expect(headers.has('authorization')).toBe(false);
        expect(init?.credentials).toBe(
          url.pathname.endsWith('/start') ? 'omit' : 'include',
        );
        if (url.pathname.endsWith('/start'))
          return json({ challenge_reference: challenge }, 202);
        if (url.pathname.endsWith('/logout')) {
          expect(init?.body).toBe('{}');
          cookie = false;
          return json(null, 204);
        }
        if (url.pathname.endsWith('/verify')) {
          cookie = true;
          if (loseVerify) throw new TypeError('Synthetic lost verify response');
          return json(grant('synthetic-initial'));
        }
        expect(init?.body).toBe('{}');
        if (!cookie) return json({ error: 'AUTHENTICATION_REQUIRED' }, 401);
        refreshes++;
        return json(grant('synthetic-refreshed'));
      }
      expect(init?.credentials).toBe('omit');
      if (url.pathname === '/v1/auth/me') {
        expect(headers.get('authorization')).toMatch(/^Bearer synthetic-/);
        return json({ user_id: owner, roles });
      }
      if (url.pathname === '/v1/customer/me/profile')
        return json({
          user_id: owner,
          display_name: null,
          email: null,
          phone_display: '+91••••••1234',
          version: 1,
        });
      if (url.pathname === '/v1/customer/me/preferences')
        return json({
          language: 'en-IN',
          collection_notifications: true,
          version: 1,
        });
      if (url.pathname === '/v1/customer/payment-methods')
        return json({ methods: [] });
      expect(url.pathname + url.search).toBe(protectedPath);
      if (expired)
        expect(headers.get('authorization')).toBe('Bearer synthetic-refreshed');
      if (
        !expired &&
        headers.get('authorization') === 'Bearer synthetic-initial'
      ) {
        expired = true;
        return json({}, 401);
      }
      return json([]);
    },
  );
  const create = () => releaseRuntime(browser, locks, fetcher);
  return {
    create,
    fetcher,
    lockNames,
    refreshCount: () => refreshes,
    loseVerifyResponse: () => {
      loseVerify = true;
    },
  };
}
const phone = '+919999999999';
async function signIn(runtime: Awaited<ReturnType<typeof releaseRuntime>>) {
  const reference = await runtime.session.startOtp(phone);
  return runtime.session.login(reference, '123456');
}

test.each([true, false])(
  'account features request their FastAPI routes only when enabled: %s',
  async (enabled) => {
    const fixture = harness(config, ['CUSTOMER'], {
      profile: enabled,
      preferences: enabled,
      paymentMethods: enabled,
    });
    const runtime = await fixture.create();
    await signIn(runtime);
    const repository = runtime.customer().repo;
    fixture.fetcher.mockClear();
    const outcomes = await Promise.allSettled(
      [
        repository.profile,
        repository.preferences,
        repository.paymentMethods,
      ].map(async (read) => read()),
    );
    expect(outcomes.map((outcome) => outcome.status)).toEqual(
      Array(3).fill(enabled ? 'fulfilled' : 'rejected'),
    );
    expect(
      fixture.fetcher.mock.calls.map(([url, init]) => [
        String(url),
        init?.method,
      ]),
    ).toEqual(
      enabled
        ? [
            [gateway + '/v1/customer/me/profile', 'GET'],
            [gateway + '/v1/customer/me/preferences', 'GET'],
            [gateway + '/v1/customer/payment-methods', 'GET'],
          ]
        : [],
    );
    await runtime.session.logout();
  },
);
test('release composition signs in, refreshes a protected request, restores after reload, and logs out', async () => {
  const fixture = harness();
  const runtime = await fixture.create();

  expect(runtime.session.snapshot().phase).toBe('signedOut');
  await signIn(runtime);
  expect(runtime.session.snapshot().phase).toBe('ready');
  await expect(
    runtime.session.request(protectedPath, {}, 200),
  ).resolves.toEqual([]);
  expect(fixture.refreshCount()).toBe(1);
  const reloaded = await fixture.create();
  await reloaded.session.resume();
  expect(reloaded.session.snapshot().phase).toBe('ready');
  expect(fixture.refreshCount()).toBe(2);
  expect([...fixture.lockNames]).toEqual([
    `tirodhan:web-session:${gateway}:customer`,
  ]);
  await reloaded.session.logout();
  const signedOut = await fixture.create();
  await signedOut.session.resume();
  expect(signedOut.session.snapshot().phase).toBe('signedOut');
});

test('release composition checks the live role even after valid OTP', async () => {
  const fixture = harness(config, ['MANAGER']);
  const runtime = await fixture.create();
  await expect(signIn(runtime)).rejects.toThrow();
  expect(runtime.session.snapshot().phase).toBe('denied');
  await expect(
    runtime.session.request(protectedPath, {}, 200),
  ).rejects.toThrow();
});

test('lost verification exposes confirmed sign-out recovery after reload or from another tab', async () => {
  const fixture = harness();
  const first = await fixture.create();
  const otherTab = await fixture.create();
  fixture.loseVerifyResponse();
  try {
    await expect(signIn(first)).rejects.toThrow();
    const reloaded = await fixture.create();
    expect(reloaded.session.snapshot()).toMatchObject({
      phase: 'error',
      logoutUnconfirmed: true,
    });
    fixture.fetcher.mockClear();
    await expect(otherTab.session.startOtp(phone)).rejects.toThrow();
    expect(otherTab.session.snapshot().logoutUnconfirmed).toBe(true);
    expect(fixture.fetcher).not.toHaveBeenCalled();
    await reloaded.session.logout();
    expect(reloaded.session.snapshot()).toMatchObject({
      phase: 'signedOut',
      logoutUnconfirmed: false,
    });
    expect((await fixture.create()).session.snapshot().phase).toBe('signedOut');
  } finally {
    // Ensure a failed assertion cannot leave the shared synthetic marker set.
    await first.session.logout();
  }
});

test.each([
  null,
  { ...config, approved: false },
  { ...config, approvalReference: '' },
  { ...config, environment: 'prod' },
  { ...config, product: 'operations' },
  { ...config, browserOrigin: 'https://different.release-test.invalid' },
  { ...config, csrf: { header: 'x-gateway-secret', value: 'test' } },
  { ...config, gatewaySecret: 'forbidden-extra' },
])(
  'release composition fails closed on invalid configuration %#',
  async (configuration) => {
    const fixture = harness(configuration);
    const runtime = await fixture.create();
    expect(runtime.session.snapshot().phase).toBe('unavailable');
    await expect(signIn(runtime)).rejects.toThrow();
    expect(fixture.fetcher).toHaveBeenCalledTimes(1);
  },
);
