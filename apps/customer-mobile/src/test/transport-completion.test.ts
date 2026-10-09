import { Transport } from '../api/transport';
import { createCustomerApi } from '../api/customer-client';
import { capabilityGate } from '../api/capabilities';
const ok = (value: unknown) =>
  ({ ok: true, status: 200, json: async () => value }) as Response;
function setup(
  fetcher = jest.fn().mockResolvedValue(ok({})),
  preview = false,
  timeout = 15000,
) {
  const session = {
    accessToken: () => 'token',
    refresh: jest.fn(),
    clear: jest.fn(),
  };
  return {
    fetcher,
    session,
    transport: new Transport(
      'https://api.example',
      session,
      () => 'stable-key',
      fetcher,
      timeout,
      () => !preview,
    ),
  };
}
test('malformed successful JSON is a protocol error; 204 requires no JSON decoding', async () => {
  const { transport, fetcher } = setup();
  fetcher.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError('Private raw body');
    },
  } as unknown as Response);
  await expect(transport.request('/read')).rejects.toMatchObject({
    kind: 'protocol',
    message: 'Request protocol',
  });
  const json = jest.fn();
  fetcher.mockResolvedValueOnce({
    ok: true,
    status: 204,
    json,
  } as unknown as Response);
  await expect(
    transport.request('/delete', { method: 'DELETE' }),
  ).resolves.toBeUndefined();
  expect(json).not.toHaveBeenCalled();
});
test('timeout and caller abort remain distinct safe failures', async () => {
  const fetcher = jest.fn(
    (_url, options) =>
      new Promise<Response>((_resolve, reject) =>
        options.signal.addEventListener(
          'abort',
          () => reject(new Error('private')),
          { once: true },
        ),
      ),
  );
  const { transport } = setup(fetcher, false, 15);
  await expect(transport.request('/slow')).rejects.toMatchObject({
    kind: 'timeout',
  });
  const controller = new AbortController(),
    request = transport.request('/abort', { signal: controller.signal });
  controller.abort();
  await expect(request).rejects.toMatchObject({ kind: 'cancelled' });
});
test('preview blocks authenticated writes even with credentials; public OTP is independent', async () => {
  const { transport, fetcher } = setup(undefined, true);
  await expect(
    transport
      .command('/v1/addresses', {
        method: 'POST',
        body: { address: 'private' },
      })
      .execute(),
  ).rejects.toMatchObject({ kind: 'preview' });
  expect(fetcher).not.toHaveBeenCalled();
  await transport.request('/v1/auth/otp/start', {
    method: 'POST',
    authenticated: false,
    body: {},
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
test('safe machine errors use allowlist only and never parse human exception detail', async () => {
  const { transport, fetcher } = setup();
  const error = (body: unknown) =>
    ({
      ok: false,
      status: 409,
      headers: { get: () => 'application/json' },
      json: async () => body,
    }) as unknown as Response;
  fetcher
    .mockResolvedValueOnce(
      error({ error: { code: 'PLANNING_STARTED' }, detail: 'private SQL' }),
    )
    .mockResolvedValueOnce(error({ detail: 'PLANNING_STARTED' }))
    .mockResolvedValueOnce(error({ error: { code: 'PRIVATE_SECRET' } }));
  await expect(transport.request('/one')).rejects.toMatchObject({
    code: 'PLANNING_STARTED',
  });
  for (const path of ['/two', '/three'])
    await expect(transport.request(path)).rejects.toMatchObject({
      code: undefined,
    });
});
test('customer pending gates make no HTTP calls; enabled adapters encode identity and cursor', async () => {
  const { transport, fetcher } = setup();
  const pending = createCustomerApi(transport, capabilityGate(new Set()));
  expect(() => pending.catalogue()).toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  const api = createCustomerApi(transport, () => {});
  await api.collections('history', 'cursor/+');
  await api.detail('id/secret');
  expect(fetcher.mock.calls[0]![0]).toBe(
    'https://api.example/v1/customer/collection-requests?view=history&limit=20&cursor=cursor%2F%2B',
  );
  expect(fetcher.mock.calls[1]![0]).toBe(
    'https://api.example/v1/customer/collection-requests/id%2Fsecret',
  );
});
test('prepared cancellation survives 401 replay with identical header and body and no refund orchestration', async () => {
  let token = 'old';
  const refresh = jest.fn(async () => {
      token = 'new';
    }),
    fetcher = jest
      .fn()
      .mockResolvedValueOnce({ status: 401, ok: false })
      .mockResolvedValue(ok({ status: 'CANCELLED' }));
  const transport = new Transport(
    'https://api.example',
    { accessToken: () => token, refresh, clear: jest.fn() },
    () => 'one-intent',
    fetcher,
  );
  const command = transport.command('/v1/collection-requests/request/cancel', {
    method: 'POST',
  });
  await command.execute();
  await command.execute();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(
    new Set(
      fetcher.mock.calls.map((call) => call[1].headers['Idempotency-Key']),
    ),
  ).toEqual(new Set(['one-intent']));
  expect(fetcher.mock.calls.every((call) => call[0].endsWith('/cancel'))).toBe(
    true,
  );
});
