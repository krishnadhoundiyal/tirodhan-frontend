import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createElement } from 'react';
import App from '../App';
import { fixturePayload } from '../preview/fixtures';
import { releaseRuntime } from '../runtime';

const browser = 'https://operations.release-test.invalid';
const gateway = 'https://gateway.release-test.invalid';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const challenge = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const identity = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const config = {
  approved: true,
  approvalReference: 'synthetic-only',
  environment: 'nonprod',
  product: 'operations',
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
const protectedPath = '/v1/manager/riders?limit=20';
const json = (body: unknown, status = 200) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;
function harness(configuration: unknown = config, roles = ['MANAGER']) {
  let cookie = false;
  let refreshes = 0;
  let expired = false;
  let loseVerify = false;
  let rejectLogout = false;
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
          if (rejectLogout) {
            rejectLogout = false;
            return json({}, 503);
          }
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
      if (
        url.pathname.startsWith('/v2/manager/routes/') ||
        url.pathname === '/v1/manager/business/operating_region'
      )
        return json(fixturePayload(url.pathname, 'Normal workload'));
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
  const create = (dispatch = false) =>
    releaseRuntime(
      { dispatch, fleet: false, orchestration: false },
      browser,
      locks,
      fetcher,
    );
  return {
    create,
    fetcher,
    lockNames,
    refreshCount: () => refreshes,
    hasCookie: () => cookie,
    loseVerifyResponse: () => {
      loseVerify = true;
    },
    rejectNextLogout: () => {
      rejectLogout = true;
    },
  };
}
const phone = '+919999999999';

test('starting another sign-in blocks OTP until the gateway confirms sign-out', async () => {
  const fixture = harness();
  const runtime = await fixture.create();
  const view = render(createElement(App, { runtime }));
  const commandIds = () =>
    fixture.fetcher.mock.calls
      .filter(([url]) => String(url) === gateway + '/web/start')
      .map(([, init]) => JSON.parse(String(init?.body)).client_request_id);
  const requestCode = () => {
    fireEvent.change(screen.getByLabelText('Phone number'), {
      target: { value: phone },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request code' }));
  };
  try {
    requestCode();
    const code = await screen.findByLabelText('One-time code');
    fireEvent.change(code, { target: { value: '123456' } });
    fixture.loseVerifyResponse();
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
    await screen.findByText(
      'The web session could not be verified. Please try again.',
    );
    expect(fixture.hasCookie()).toBe(true);

    fixture.rejectNextLogout();
    fireEvent.click(
      screen.getByRole('button', { name: 'Start another sign-in' }),
    );
    await screen.findByText(/Gateway sign-out was not confirmed/);
    expect(runtime.session.snapshot().logoutUnconfirmed).toBe(true);
    expect(fixture.hasCookie()).toBe(true);
    expect(screen.queryByLabelText('One-time code')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Request code' })).toBeNull();
    expect(commandIds()).toHaveLength(1);

    fireEvent.click(
      screen.getByRole('button', { name: 'Retry gateway sign-out' }),
    );
    const input =
      await screen.findByLabelText<HTMLInputElement>('Phone number');
    expect(input.value).toBe('');
    expect(fixture.hasCookie()).toBe(false);
    requestCode();
    expect(
      await screen.findByLabelText<HTMLInputElement>('One-time code'),
    ).toHaveProperty('value', '');
    expect(commandIds()).toHaveLength(2);
    expect(new Set(commandIds()).size).toBe(2);
  } finally {
    view.unmount();
    await runtime.session.logout();
    runtime.dispose();
  }
});
async function signIn(runtime: Awaited<ReturnType<typeof releaseRuntime>>) {
  const reference = await runtime.session.startOtp({
    phone,
    client_request_id: identity,
  });
  return runtime.session.verifyOtp({
    client_login_id: identity,
    challenge_reference: reference,
    code: '123456',
  });
}
test('release composition signs in, refreshes a protected request, restores after reload, and logs out', async () => {
  const fixture = harness();
  const runtime = await fixture.create();

  expect(runtime.session.snapshot().phase).toBe('signedOut');
  await signIn(runtime);
  expect(runtime.session.snapshot().phase).toBe('ready');
  await expect(runtime.session.read(protectedPath)).resolves.toEqual([]);
  expect(fixture.refreshCount()).toBe(1);
  const reloaded = await fixture.create();
  await reloaded.session.restore();
  expect(reloaded.session.snapshot().phase).toBe('ready');
  expect(fixture.refreshCount()).toBe(2);
  expect([...fixture.lockNames]).toEqual([
    `tirodhan:web-session:${gateway}:operations`,
  ]);
  await reloaded.session.logout();
  const signedOut = await fixture.create();
  await signedOut.session.restore();
  expect(signedOut.session.snapshot().phase).toBe('signedOut');
});

test('release composition checks the live role even after valid OTP', async () => {
  const fixture = harness(config, ['CUSTOMER']);
  const runtime = await fixture.create();
  await expect(signIn(runtime)).resolves.toBe(false);
  expect(runtime.session.snapshot().phase).toBe('denied');
  await expect(runtime.session.read(protectedPath)).rejects.toThrow();
});

test('the Manager route deep link stays gated and history restores the selected route and input', async () => {
  window.history.replaceState(null, '', '/routes/' + identity);
  const fixture = harness();
  const runtime = await fixture.create(true);
  const view = render(createElement(App, { runtime }));
  try {
    expect(
      screen.queryByRole('heading', { name: /Routes & regional/i }),
    ).toBeNull();
    const readRoute = (id: string) =>
      fixture.fetcher.mock.calls.some(
        ([url]) => String(url) === gateway + '/v2/manager/routes/' + id,
      );
    expect(readRoute(identity)).toBe(false);
    await act(async () => {
      await signIn(runtime);
    });
    expect(
      screen.getByRole('heading', { name: /Routes & regional/i }),
    ).toBeTruthy();
    expect(window.location.pathname).toBe('/routes/' + identity);
    await screen.findByText('Current route revision');
    expect(
      (screen.getByLabelText('Route UUID') as HTMLInputElement).value,
    ).toBe(identity);
    await waitFor(() => expect(readRoute(identity)).toBe(true));
    fireEvent.change(screen.getByLabelText('Route UUID'), {
      target: { value: challenge },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Read details' }));
    expect(window.location.pathname).toBe('/routes/' + challenge);
    await waitFor(() => expect(readRoute(challenge)).toBe(true));
    act(() => window.history.back());
    await waitFor(() => {
      expect(window.location.pathname).toBe('/routes/' + identity);
      expect(
        (screen.getByLabelText('Route UUID') as HTMLInputElement).value,
      ).toBe(identity);
    });
  } finally {
    view.unmount();
    runtime.dispose();
    window.history.replaceState(null, '', '/');
  }
});

test.each([
  null,
  { ...config, approved: false },
  { ...config, approvalReference: '' },
  { ...config, environment: 'prod' },
  { ...config, product: 'customer' },
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
