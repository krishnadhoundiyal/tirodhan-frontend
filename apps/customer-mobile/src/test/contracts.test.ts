import { createApi } from '../api/client';
import { Transport } from '../api/transport';
import { authFlow } from '../features/auth/flow';
import { SessionStore } from '../session/store';
import { ApiError } from '../api/errors';
const ok = (body: unknown, status = 200) =>
  ({ ok: true, status, json: async () => body }) as Response;
function setup() {
  const fetcher = jest.fn().mockResolvedValue(ok({}));
  const uuid = jest.fn(() => 'temporary-header');
  const transport = new Transport(
    'https://api.example',
    { accessToken: () => 'access', refresh: jest.fn(), clear: jest.fn() },
    uuid,
    fetcher,
  );
  return { api: createApi(transport), transport, fetcher, uuid };
}
test('OTP start uses a new client command ID and exact backend body', async () => {
  const { api, fetcher } = setup();
  fetcher.mockResolvedValue(ok({ challenge_reference: 'challenge' }, 202));
  const flow = authFlow(
    api,
    {} as SessionStore,
    jest.fn().mockReturnValueOnce('start-1').mockReturnValueOnce('start-2'),
  );
  await flow.start('+919999999999');
  await flow.start('+919999999999');
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({
    client_request_id: 'start-1',
    phone: '+919999999999',
  });
  expect(JSON.parse(fetcher.mock.calls[1]![1].body).client_request_id).toBe(
    'start-2',
  );
  expect(fetcher.mock.calls[0]![1].headers.Authorization).toBeUndefined();
});
test('successful OTP verification creates session without provider ID or phone fields', async () => {
  const { api, fetcher } = setup();
  const result = {
    access_token: 'a',
    refresh_token: 'r',
    token_type: 'bearer',
    expires_in: 75,
    user_id: 'u',
  };
  fetcher.mockResolvedValue(ok(result));
  const establish = jest.fn();
  await authFlow(
    api,
    { establish } as unknown as SessionStore,
    () => 'login-1',
  ).verify('challenge', '123456');
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({
    client_login_id: 'login-1',
    challenge_reference: 'challenge',
    code: '123456',
  });
  expect(establish).toHaveBeenCalledWith(result);
});
test('failed OTP does not establish a session', async () => {
  const { api, fetcher } = setup();
  fetcher.mockResolvedValue({ ok: false, status: 401 } as Response);
  const establish = jest.fn();
  await expect(
    authFlow(api, { establish } as unknown as SessionStore, () => 'id').verify(
      'challenge',
      '999999',
    ),
  ).rejects.toBeInstanceOf(ApiError);
  expect(establish).not.toHaveBeenCalled();
});
test('saved addresses read supplies cancellation', async () => {
  const { api, fetcher } = setup();
  const controller = new AbortController();
  const address = {
    address_id: 'id',
    address: 'Address',
    label: 'Home',
    location: null,
    status: 'ACTIVE',
    is_default: true,
    version: 3,
  };
  fetcher.mockResolvedValue(ok([address]));
  expect(await api.addresses(controller.signal)).toEqual([address]);
  expect(fetcher.mock.calls[0]![0]).toBe('https://api.example/v1/addresses');
});
test('address update maps expected_version and reuses boundary adaptation on retry', async () => {
  const { api, fetcher, uuid } = setup();
  const body = {
    address: 'Changed',
    is_default: false,
    location: null,
    expected_version: 3,
  };
  const command = api.updateAddress('id', body);
  await command.execute();
  await command.execute();
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual(body);
  expect(fetcher.mock.calls[0]![1].method).toBe('PUT');
  expect(fetcher.mock.calls[1]![1].headers['Idempotency-Key']).toBe(
    'temporary-header',
  );
  expect(uuid).toHaveBeenCalledTimes(1);
});
test('serviceability sends exactly one source without client-derived cells', async () => {
  const { api, fetcher } = setup();
  await api.serviceability({ source_address_id: 'address-id' }).execute();
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({
    source_address_id: 'address-id',
  });
});
test('collection and optional quantity/weight map unchanged; no frontend price', async () => {
  const { api, fetcher, uuid } = setup();
  const body = {
    client_request_id: 'request-command',
    serviceability_context_id: 'context',
    slot_start: '2026-10-10T10:00:00+05:30',
    slot_end: '2026-10-10T10:30:00+05:30',
    items: [
      {
        item_category_code: 'backend-code',
        declared_quantity: 2,
        declared_weight_grams: 500,
      },
    ],
  };
  await api.createCollection(body).execute();
  expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual(body);
  expect(uuid).not.toHaveBeenCalled();
  expect(fetcher.mock.calls[0]![1].headers['Idempotency-Key']).toBeUndefined();
});
test('payment initiation has no invented body, webhook call, or captured state', async () => {
  const { api, fetcher } = setup();
  const attempt = {
    payment_attempt_id: 'attempt',
    status: 'CREATED',
    provider: 'RAZORPAY',
    provider_order_id: 'order',
    provider_payment_id: null,
    failure_code: null,
  };
  fetcher.mockResolvedValue(ok(attempt, 201));
  expect(await api.paymentAttempt('request').execute()).toEqual(attempt);
  expect(fetcher.mock.calls[0]![0]).toBe(
    'https://api.example/v1/payments/collection-requests/request/attempts',
  );
  expect(fetcher.mock.calls[0]![1].body).toBeUndefined();
});
test('transport redacts backend exception details', async () => {
  const { transport, fetcher } = setup();
  const json = jest.fn();
  fetcher.mockResolvedValue({
    status: 500,
    ok: false,
    json,
  } as unknown as Response);
  await expect(transport.request('/protected')).rejects.toMatchObject({
    message: 'Request failed (500)',
  });
  expect(json).not.toHaveBeenCalled();
});
test('transport cancels stale requests', async () => {
  const { transport, fetcher } = setup();
  fetcher.mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener('abort', () =>
          reject(new Error('aborted')),
        ),
      ),
  );
  const controller = new AbortController();
  const call = transport.request('/protected', { signal: controller.signal });
  controller.abort();
  await expect(call).rejects.toMatchObject({ kind: 'cancelled' });
});
