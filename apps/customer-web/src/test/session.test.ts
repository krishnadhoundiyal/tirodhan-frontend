import { CustomerSession, unavailableAdapter } from '../auth/session';
import { CustomerApi } from '../api/customer';
import { createRuntime } from '../runtime';
import {
  challenge,
  deferred,
  grantValue,
  harness,
  other,
  owner,
  response,
} from './helpers';

describe('CUSTOMER browser session boundary', () => {
  test('a delayed concurrent 401 shares a completed refresh even when token text is unchanged', async () => {
    const h = harness();
    await h.login();
    const late = deferred<Response>();
    let businessCalls = 0;
    h.fetcher.mockImplementation(async (input) => {
      if (String(input).endsWith('/me'))
        return response({ user_id: owner, roles: ['CUSTOMER'] });
      businessCalls++;
      if (businessCalls === 1) return response({}, 401);
      if (businessCalls === 2) return late.promise;
      return response([]);
    });
    const api = new CustomerApi(h.session),
      first = api.addresses(),
      second = api.addresses();
    await first;
    expect(h.adapter.refresh).toHaveBeenCalledTimes(1);
    late.resolve(response({}, 401));
    await second;
    expect(h.adapter.refresh).toHaveBeenCalledTimes(1);
  });
  test('production gate cannot call raw auth or protected APIs', async () => {
    const fetcher = jest.fn();
    const s = new CustomerSession(unavailableAdapter, null, fetcher);
    expect(s.snapshot().phase).toBe('unavailable');
    await expect(s.login(challenge, '123456')).rejects.toThrow();
    await expect(s.resume()).rejects.toThrow();
    await expect(
      s.request('/v1/addresses', { method: 'GET' }, 200),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  test.each([
    'http://gateway.example',
    'https://gateway.example/',
    'https://a:b@gateway.example',
    'https://gateway.example?x=1',
  ])('rejects non-exact HTTPS origin %s', (origin) => {
    expect(
      () => new CustomerSession(unavailableAdapter, origin, jest.fn()),
    ).toThrow();
  });
  test('admission uses /me with a memory Bearer; grants and snapshots do not expose secrets', async () => {
    const h = harness();
    await h.login();
    expect(h.session.snapshot().principal).toEqual({
      user_id: owner,
      roles: ['CUSTOMER'],
    });
    expect(h.fetcher).toHaveBeenCalledWith(
      'https://gateway.example/v1/auth/me',
      expect.objectContaining({
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        headers: expect.objectContaining({
          Authorization: 'Bearer synthetic-access',
        }),
      }),
    );
    expect(JSON.stringify(h.session)).not.toContain('synthetic-access');
    expect(JSON.stringify(h.session.snapshot())).not.toContain('access_token');
  });
  test.each([{ roles: [] }, { roles: ['MANAGER'] }, { roles: ['RIDER'] }])(
    'denies a non-CUSTOMER principal %j',
    async ({ roles }) => {
      const h = harness({ roles });
      await expect(h.login()).rejects.toMatchObject({ kind: 'forbidden' });
      expect(h.session.snapshot()).toMatchObject({
        phase: 'denied',
        principal: null,
      });
    },
  );
  test('allows live CUSTOMER alongside other roles without sending role assertions', async () => {
    const h = harness({ roles: ['CUSTOMER', 'MANAGER'] });
    await h.login();
    await new CustomerApi(h.session).addresses();
    expect(h.fetcher.mock.calls.at(-1)?.[1]?.body).toBeUndefined();
  });
  test.each([
    { ...grantValue(), refresh_token: 'must-never-reach-browser' },
    { ...grantValue(), expires_in: 0 },
    { ...grantValue(), token_type: 'other' },
    { ...grantValue(), access_token: 'bad\r\ntoken' },
  ])('rejects unsafe grant %#', async (value) => {
    const h = harness();
    jest.mocked(h.adapter.verifyOtp).mockResolvedValue(value);
    await expect(h.login()).rejects.toMatchObject({ kind: 'invalid' });
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  test('owner mismatch from /me rejects admission', async () => {
    const h = harness();
    h.fetcher.mockResolvedValue(
      response({ user_id: other, roles: ['CUSTOMER'] }),
    );
    await expect(h.login()).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(h.session.snapshot().principal).toBeNull();
  });
  test('two concurrent 401s share one refresh and each replay once', async () => {
    const h = harness();
    await h.login();
    let n = 0;
    h.fetcher.mockImplementation(async (input) =>
      String(input).endsWith('/me')
        ? response({ user_id: owner, roles: ['CUSTOMER'] })
        : response([], ++n <= 2 ? 401 : 200),
    );
    const pending = deferred<unknown>();
    jest.mocked(h.adapter.refresh).mockReturnValue(pending.promise);
    const api = new CustomerApi(h.session);
    const a = api.addresses(),
      b = api.addresses();
    await new Promise((r) => setTimeout(r, 10));
    expect(h.adapter.refresh).toHaveBeenCalledTimes(1);
    pending.resolve({ ...grantValue(), access_token: 'new-access' });
    await expect(Promise.all([a, b])).resolves.toEqual([[], []]);
    expect(n).toBe(4);
  });
  test('403 never refreshes', async () => {
    const h = harness();
    await h.login();
    h.fetcher.mockResolvedValue(response({}, 403));
    await expect(new CustomerApi(h.session).addresses()).rejects.toMatchObject({
      kind: 'forbidden',
    });
    expect(h.adapter.refresh).not.toHaveBeenCalled();
  });
  test('repeated 401 clears customer and does not loop', async () => {
    const h = harness();
    await h.login();
    h.fetcher.mockImplementation(async (input) =>
      String(input).endsWith('/me')
        ? response({ user_id: owner, roles: ['CUSTOMER'] })
        : response({}, 401),
    );
    await expect(new CustomerApi(h.session).addresses()).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    expect(h.adapter.refresh).toHaveBeenCalledTimes(1);
    expect(h.session.snapshot().principal).toBeNull();
  });
  test('refresh cannot switch customer', async () => {
    const h = harness();
    await h.login();
    h.fetcher.mockResolvedValue(response({}, 401));
    jest
      .mocked(h.adapter.refresh)
      .mockResolvedValue({ ...grantValue(), user_id: other });
    await expect(new CustomerApi(h.session).addresses()).rejects.toThrow();
    expect(h.session.snapshot().principal).toBeNull();
  });
  test('refresh rechecks current membership', async () => {
    const h = harness();
    await h.login();
    h.fetcher.mockImplementation(async (input) =>
      String(input).endsWith('/me')
        ? response({ user_id: owner, roles: ['RIDER'] })
        : response({}, 401),
    );
    await expect(new CustomerApi(h.session).addresses()).rejects.toMatchObject({
      kind: 'forbidden',
    });
    expect(h.session.snapshot().principal).toBeNull();
  });
  test('pre-expiry refresh is coordinated, followed by at most one business attempt', async () => {
    const h = harness();
    jest
      .mocked(h.adapter.verifyOtp)
      .mockResolvedValue({ ...grantValue(), expires_in: 1 });
    await h.login();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);
    h.fetcher.mockImplementation(async (input) =>
      String(input).endsWith('/me')
        ? response({ user_id: owner, roles: ['CUSTOMER'] })
        : response({}, 401),
    );
    try {
      await expect(new CustomerApi(h.session).addresses()).rejects.toThrow();
      expect(h.adapter.refresh).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });
  test('logout immediately clears memory/cache and rejects late reads', async () => {
    const h = harness();
    await h.login();
    const r = createRuntime(h.session);
    r.client.setQueryData(['customer-addresses', owner], ['private']);
    const pending = deferred<Response>();
    h.fetcher.mockReturnValue(pending.promise);
    const read = new CustomerApi(h.session).addresses();
    const failed = expect(read).rejects.toThrow();
    await h.session.logout();
    expect(r.client.getQueryCache().getAll()).toHaveLength(0);
    expect(h.session.snapshot().principal).toBeNull();
    pending.resolve(response([]));
    await failed;
  });
  test('lost sign-out blocks login/resume until explicit successful retry', async () => {
    const h = harness();
    await h.login();
    jest
      .mocked(h.adapter.logout)
      .mockRejectedValueOnce(new Error('secret backend detail'));
    await expect(h.session.logout()).rejects.toThrow();
    await expect(h.login()).rejects.toThrow();
    await expect(h.session.resume()).rejects.toThrow();
    await h.session.logout();
    await h.login();
    expect(h.session.snapshot().phase).toBe('ready');
  });
  test('hung response body and adapter operations are bounded', async () => {
    const h = harness({ timeout: 15 });
    await h.login();
    h.fetcher.mockResolvedValue({
      status: 200,
      headers: { get: () => 'application/json' },
      text: () => new Promise(() => {}),
    } as unknown as Response);
    await expect(new CustomerApi(h.session).addresses()).rejects.toMatchObject({
      kind: 'unavailable',
    });
    await h.session.logout();
    jest.mocked(h.adapter.refresh).mockReturnValue(new Promise(() => {}));
    await expect(h.session.resume()).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });
  test('caller abort rejects a hung read promptly', async () => {
    const h = harness();
    await h.login();
    h.fetcher.mockReturnValue(new Promise(() => {}));
    const c = new AbortController();
    const read = new CustomerApi(h.session).addresses(c.signal);
    c.abort();
    await expect(read).rejects.toMatchObject({ kind: 'cancelled' });
  });
  test('business API path whitelist rejects credential/query/foreign paths', async () => {
    const h = harness();
    await h.login();
    for (const path of [
      '/v1/auth/otp/verify',
      'https://evil.example',
      '/v1/addresses?token=x',
      '/v2/customer/slot-holds',
    ])
      await expect(
        h.session.request(path, { method: 'GET' }, 200),
      ).rejects.toMatchObject({ kind: 'invalid' });
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
});
