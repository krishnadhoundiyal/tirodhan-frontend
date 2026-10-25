import {
  createApimWebSessionAdapter,
  type ApimSessionConfiguration,
  type CookieOperationLock,
} from '../auth/apim-adapter';

const id = (n: number) =>
  '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
import { grantValue as access, deferred, response } from './helpers';
const config = (): ApimSessionConfiguration => ({
  approved: true,
  approvalReference: 'LOCAL TEST ONLY - NOT APPROVED',
  environment: 'nonprod',
  product: 'customer',
  gatewayOrigin: 'https://gateway.local-test.invalid',
  browserOrigin: 'https://customer.local-test.invalid',
  routes: {
    start: '/test/start',
    verify: '/test/verify',
    refresh: '/test/refresh',
    logout: '/test/logout',
  },
  csrf: { header: 'X-Local-Test-Session', value: 'test' },
});
const verifyBody = {
  client_login_id: id(81),
  challenge_reference: id(80),
  code: '123456',
};
const json = (body: unknown, status = 200): Response =>
  ({
    ...response(body, status),
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify(body),
    redirected: false,
    type: 'cors',
    url: '',
  }) as Response;
function lock(): CookieOperationLock {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request: (_name, _options, operation) => {
      const run = tail.then(operation);
      tail = run.catch(() => {});
      return run;
    },
  };
}
function harness(timeoutMs = 1000, locks = lock()) {
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async (input) =>
      String(input).endsWith('/logout')
        ? json(null, 204)
        : String(input).endsWith('/start')
          ? json({ challenge_reference: id(80) }, 202)
          : json(access()),
  );
  const adapter = createApimWebSessionAdapter(config(), {
    browserOrigin: config().browserOrigin,
    fetcher,
    locks,
    timeoutMs,
  });
  return { adapter, fetcher, locks };
}
const signal = () => new AbortController().signal;
test.each([
  'wrongKeys',
  'stringApproval',
  'routeNewline',
  'credentialConfiguration',
])('malicious %s configuration cannot enable a transport', (variant) => {
  const configuration = config();
  if (variant === 'credentialConfiguration')
    Object.assign(configuration, { refresh_token: 'must-not-be-retained' });
  if (variant === 'wrongKeys')
    configuration.routes = {
      ...configuration.routes,
      start: undefined,
      renamed: '/test/start',
    } as unknown as ApimSessionConfiguration['routes'];
  if (variant === 'stringApproval')
    configuration.approved = 'true' as unknown as boolean;
  if (variant === 'routeNewline') configuration.routes.refresh += '\n';
  const fetcher = jest.fn();
  const adapter = createApimWebSessionAdapter(configuration, {
    browserOrigin: config().browserOrigin,
    fetcher,
    locks: lock(),
  });
  expect(adapter.available).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
});
test.each([
  'unapproved',
  'missing',
  'foreignOrigin',
  'noLock',
  'badPath',
  'badCsrf',
  'prod',
])('%s configuration fails closed', (kind) => {
  const c = config();
  if (kind === 'unapproved') c.approved = false;
  if (kind === 'badPath') c.routes.refresh = '/v1/auth/refresh';
  if (kind === 'badCsrf') c.csrf.header = 'X-Bad\r\nHeader';
  if (kind === 'prod') c.environment = 'prod' as 'nonprod';
  const adapter = createApimWebSessionAdapter(kind === 'missing' ? null : c, {
    browserOrigin:
      kind === 'foreignOrigin' ? 'https://evil.invalid' : c.browserOrigin,
    fetcher: jest.fn(),
    locks: kind === 'noLock' ? undefined : lock(),
  });
  expect(adapter.available).toBe(false);
});
test('start preserves the command identity; only cookie-auth routes include credentials', async () => {
  const { adapter, fetcher } = harness();
  const body = { client_request_id: id(82), phone: '+919999999999' };
  expect(await adapter.startOtp(body, signal())).toEqual({
    challenge_reference: id(80),
  });
  await adapter.verifyOtp(verifyBody, signal());
  await adapter.refresh(signal());
  await adapter.logout(signal());
  expect(
    fetcher.mock.calls.map(([input]) => new URL(String(input)).pathname),
  ).toEqual([
    '/test/start',
    '/test/logout',
    '/test/verify',
    '/test/refresh',
    '/test/logout',
  ]);
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    credentials: 'omit',
    body: JSON.stringify(body),
  });
  for (const [, options] of fetcher.mock.calls.slice(1))
    expect(options).toMatchObject({
      credentials: 'include',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      mode: 'cors',
    });
  for (const [, options] of fetcher.mock.calls)
    expect(options?.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Local-Test-Session': 'test',
    });
});
test('duplicate in-flight verify uses one preserved identity and completed verify never replays', async () => {
  const { adapter, fetcher } = harness();
  const pending = deferred<Response>();
  fetcher
    .mockImplementationOnce(() => Promise.resolve(json(null, 204)))
    .mockImplementationOnce(() => pending.promise);
  const first = adapter.verifyOtp(verifyBody, signal()),
    second = adapter.verifyOtp(verifyBody, signal());
  await new Promise((resolve) => setTimeout(resolve, 0));
  pending.resolve(json(access()));
  await Promise.all([first, second]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await expect(adapter.verifyOtp(verifyBody, signal())).rejects.toMatchObject({
    kind: 'logoutRequired',
  });
});
test.each([401, 403, 409, 422, 429, 500, 502, 503])(
  'verify HTTP %s does not mint identity or assume login replay',
  async (status) => {
    const { adapter, fetcher } = harness();
    fetcher
      .mockResolvedValueOnce(json(null, 204))
      .mockResolvedValueOnce(json({ private: 'not reflected' }, status));
    await expect(adapter.verifyOtp(verifyBody, signal())).rejects.toMatchObject(
      { kind: 'rejected', status },
    );
    await expect(adapter.refresh(signal())).rejects.toMatchObject({
      kind: 'logoutRequired',
    });
    await expect(
      adapter.verifyOtp({ ...verifyBody, client_login_id: id(83) }, signal()),
    ).rejects.toMatchObject({ kind: 'logoutRequired' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  },
);
test.each([
  null,
  {},
  { ...access(), refresh_token: 'MUST_NOT_REACH_JS' },
  { ...access(), Cookie: 'secret' },
  { ...access(), expires_in: 0 },
  { ...access(), access_token: 'token\r\n' },
])('malformed or credential-bearing grant is rejected', async (body) => {
  const { adapter, fetcher } = harness();
  fetcher.mockResolvedValueOnce(json(body));
  await expect(adapter.refresh(signal())).rejects.toMatchObject({
    kind: 'invalid',
  });
});
test('credential-bearing redirects and non-JSON responses are rejected', async () => {
  const { adapter, fetcher } = harness();
  fetcher.mockResolvedValueOnce({
    ...json(access()),
    redirected: true,
  } as Response);
  await expect(adapter.refresh(signal())).rejects.toMatchObject({
    kind: 'invalid',
  });
  fetcher.mockResolvedValueOnce({
    ...json(access()),
    headers: new Headers({ 'Content-Type': 'text/html' }),
  } as Response);
  await expect(adapter.refresh(signal())).rejects.toMatchObject({
    kind: 'invalid',
  });
});
test('lost verify requires confirmed logout and a fresh OTP; no unknown cookie is used to attribute login', async () => {
  const { adapter, fetcher } = harness();
  fetcher
    .mockResolvedValueOnce(json(null, 204))
    .mockRejectedValueOnce(new Error('private network detail'));
  await expect(adapter.verifyOtp(verifyBody, signal())).rejects.toMatchObject({
    kind: 'uncertain',
  });
  await expect(adapter.refresh(signal())).rejects.toMatchObject({
    kind: 'logoutRequired',
  });
  await adapter.logout(signal());
  await expect(adapter.verifyOtp(verifyBody, signal())).rejects.toMatchObject({
    kind: 'logoutRequired',
  });
  await expect(
    adapter.verifyOtp({ ...verifyBody, client_login_id: id(84) }, signal()),
  ).resolves.toEqual(access());
});
test('timeout returns promptly but logout waits for the earlier Set-Cookie-capable response to settle', async () => {
  const { adapter, fetcher } = harness(25);
  const pending = deferred<Response>();
  fetcher
    .mockResolvedValueOnce(json(null, 204))
    .mockImplementationOnce(() => pending.promise);
  await expect(adapter.verifyOtp(verifyBody, signal())).rejects.toMatchObject({
    kind: 'uncertain',
  });
  const logout = adapter.logout(signal());
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(fetcher).toHaveBeenCalledTimes(2);
  pending.resolve(json(access()));
  await logout;
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(String(fetcher.mock.calls[2][0])).toMatch(/logout$/);
});
test('cancelled queued cookie operations cannot overtake an in-flight response across adapter instances', async () => {
  const shared = lock(),
    first = harness(1000, shared),
    second = harness(1000, shared);
  const pending = deferred<Response>();
  first.fetcher.mockImplementationOnce(() => pending.promise);
  const refresh = first.adapter.refresh(signal());
  const controller = new AbortController();
  const cancelled = second.adapter.refresh(controller.signal);
  controller.abort();
  await expect(cancelled).rejects.toMatchObject({ kind: 'cancelled' });
  pending.resolve(json(access()));
  await refresh;
  expect(second.fetcher).not.toHaveBeenCalled();
});
test('lost logout remains blocked until confirmed revocation retry; no token is returned by logout', async () => {
  const { adapter, fetcher } = harness();
  fetcher.mockRejectedValueOnce(new Error('private'));
  await expect(adapter.logout(signal())).rejects.toMatchObject({
    kind: 'uncertain',
  });
  await expect(
    adapter.startOtp(
      { client_request_id: id(82), phone: '+919999999999' },
      signal(),
    ),
  ).rejects.toMatchObject({ kind: 'logoutRequired' });
  expect(await adapter.logout(signal())).toBeUndefined();
  expect(fetcher.mock.calls[0][1]?.body).toBe(fetcher.mock.calls[1][1]?.body);
});

test('approved transport configuration and OTP identities are snapshotted before queued work', async () => {
  const configuration = config(),
    shared = lock(),
    gate = deferred<void>();
  const blocker = shared.request(
    'test',
    { mode: 'exclusive' },
    () => gate.promise,
  );
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
    async (input) =>
      String(input).endsWith('/logout') ? json(null, 204) : json(access()),
  );
  const adapter = createApimWebSessionAdapter(configuration, {
    browserOrigin: configuration.browserOrigin,
    fetcher,
    locks: shared,
  });
  const body = { ...verifyBody };
  const attempt = adapter.verifyOtp(body, signal());
  body.client_login_id = id(88);
  body.code = 'changed';
  configuration.gatewayOrigin = 'https://evil.invalid';
  configuration.routes.verify = '/changed';
  gate.resolve();
  await blocker;
  await attempt;
  expect(fetcher.mock.calls[1][0]).toBe(
    'https://gateway.local-test.invalid/test/verify',
  );
  expect(fetcher.mock.calls[1][1]?.body).toBe(JSON.stringify(verifyBody));
});
