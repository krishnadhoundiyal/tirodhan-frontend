import {
  address,
  addresses,
  context,
  CustomerError,
  safeMessage,
  serviceState,
} from '../api/contracts';
import { CustomerApi } from '../api/customer';
import {
  addressId,
  addressValue,
  contextValue,
  harness,
  other,
  response,
} from './helpers';

test('401 mutation replay retains the exact prepared body and idempotency key', async () => {
  const h = harness();
  await h.login();
  let writes = 0;
  h.fetcher.mockImplementation(async (input) =>
    String(input).endsWith('/me')
      ? response({
          user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          roles: ['CUSTOMER'],
        })
      : response(addressValue(), ++writes === 1 ? 401 : 201),
  );
  const command = new CustomerApi(h.session).create({
    address: 'House',
    label: null,
    location: null,
    is_default: false,
  });
  await command.execute();
  const calls = h.fetcher.mock.calls.filter((c) => c[1]?.method === 'POST');
  expect(calls).toHaveLength(2);
  expect(calls[0][1]?.body).toBe(calls[1][1]?.body);
  expect(calls[0][1]?.headers).toEqual(calls[1][1]?.headers);
  expect(h.adapter.refresh).toHaveBeenCalledTimes(1);
});

test.each([
  {},
  { ...addressValue(), version: 0 },
  { ...addressValue(), status: 'DELETED' },
  { ...addressValue(), location: { latitude: 91, longitude: 0 } },
  { ...addressValue(), extra: 'unsafe' },
])('strict address DTO rejection %#', (v) => {
  expect(() => address(v)).toThrow();
});
test('address order preserved, duplicates/archived list rejected', () => {
  const a = addressValue(),
    b = { ...a, address_id: other };
  expect(addresses([b, a]).map((a) => a.address_id)).toEqual([
    other,
    addressId,
  ]);
  expect(() => addresses([a, a])).toThrow();
  expect(() => addresses([{ ...a, status: 'ARCHIVED' }])).toThrow();
});
test.each([
  { ...contextValue(), status: 'AVAILABLE' },
  { ...contextValue(), expires_at: 'bad' },
  { ...contextValue(), source_address_version: null },
  { ...contextValue(), status: 'SERVICEABLE' },
  { ...contextValue(), failure_code: 'unexpected' },
  { ...contextValue(), expires_at: '2026-01-01T00:00:00' },
])('unsafe serviceability DTO rejected %#', (v) => {
  expect(() => context(v)).toThrow();
});
test.each([
  'PENDING',
  'SERVICEABLE',
  'UNSERVICEABLE',
  'TECHNICAL_FAILURE',
] as const)('service state retains real backend status %s', (status) => {
  const c = context({
    ...contextValue(),
    status,
    cell_id: status === 'SERVICEABLE' ? 'cell' : null,
    failure_code: status === 'TECHNICAL_FAILURE' ? 'private-code' : null,
    resolved_at: status === 'PENDING' ? null : new Date().toISOString(),
  });
  expect(serviceState(c, address(addressValue()), Date.now())).toBe(status);
});
test('expired, changed address/version and absent context fail closed', () => {
  const a = address(addressValue()),
    c = context(contextValue());
  expect(serviceState(c, a, Date.now() + 61000)).toBe('expired');
  expect(serviceState(c, { ...a, version: 2 }, Date.now())).toBe('changed');
  expect(serviceState(c, { ...a, address_id: other }, Date.now())).toBe(
    'changed',
  );
  expect(serviceState(undefined, a, Date.now())).toBe('changed');
});
test('safe error copy never renders backend exception text', () => {
  expect(safeMessage(new Error('provider-token-private'))).not.toContain(
    'provider',
  );
  expect(safeMessage(new CustomerError('conflict'))).toContain('Reload');
});
test('prepared create uses immutable exact body and key across timeout/retry and 401 replay', async () => {
  const h = harness();
  await h.login();
  const api = new CustomerApi(h.session),
    body = { address: 'House', label: null, location: null, is_default: false };
  const command = api.create(body);
  body.address = 'Changed';
  h.fetcher.mockRejectedValueOnce(new Error('network'));
  await expect(command.execute()).rejects.toThrow();
  h.fetcher.mockResolvedValue(response(addressValue(), 201));
  await command.execute();
  const calls = h.fetcher.mock.calls.filter(
    (c) => !String(c[0]).endsWith('/me'),
  );
  expect(calls).toHaveLength(2);
  expect(calls[0][1]?.body).toBe(calls[1][1]?.body);
  expect(JSON.parse(String(command.body)).address).toBe('House');
  expect(calls[0][1]?.headers).toEqual(calls[1][1]?.headers);
  expect(Object.isFrozen(command)).toBe(true);
});
test('PUT includes current version; archive has no invented body; reads have no idempotency header', async () => {
  const h = harness();
  await h.login();
  const api = new CustomerApi(h.session),
    a = address(addressValue());
  const update = api.update(a, {
    address: 'House',
    label: null,
    location: null,
    is_default: false,
  });
  expect(JSON.parse(update.body!)).toEqual({
    address: 'House',
    label: null,
    location: null,
    is_default: false,
    expected_version: 1,
  });
  const archive = api.archive(a);
  expect(archive.body).toBeUndefined();
  expect(archive.path).toBe(`/v1/addresses/${addressId}/archive`);
  await api.addresses();
  expect(h.fetcher.mock.calls.at(-1)?.[1]?.headers).not.toHaveProperty(
    'Idempotency-Key',
  );
});
test('service creation only sends saved source ID and verifies snapshot binding', async () => {
  const h = harness();
  await h.login();
  const api = new CustomerApi(h.session),
    a = address(addressValue()),
    command = api.check(a);
  expect(JSON.parse(command.body!)).toEqual({ source_address_id: addressId });
  h.fetcher.mockResolvedValue(
    response({ ...contextValue(), source_address_version: 2 }, 201),
  );
  await expect(command.execute()).rejects.toMatchObject({ kind: 'invalid' });
});
test('service read rejects wrong context ID and expired snapshot without HTTP', async () => {
  const h = harness();
  await h.login();
  const api = new CustomerApi(h.session),
    a = address(addressValue()),
    c = context(contextValue());
  h.fetcher.mockResolvedValue(
    response({ ...c, serviceability_context_id: other }),
  );
  await expect(api.readCheck(c, a)).rejects.toMatchObject({ kind: 'invalid' });
  h.fetcher.mockClear();
  await expect(
    api.readCheck({ ...c, expires_at: new Date(0).toISOString() }, a),
  ).rejects.toThrow();
  expect(h.fetcher).not.toHaveBeenCalled();
});
test('prepared command cannot execute after logout/account epoch change', async () => {
  const h = harness();
  await h.login();
  const command = new CustomerApi(h.session).archive(address(addressValue()));
  await h.session.logout();
  await h.login();
  expect(() => command.execute()).toThrow();
});
test('unknown body details, HTTP failure and malformed JSON become safe failures', async () => {
  const h = harness();
  await h.login();
  for (const status of [404, 409, 422, 429, 500, 503]) {
    h.fetcher.mockResolvedValue(
      response({ detail: 'private-provider-error' }, status),
    );
    await expect(new CustomerApi(h.session).addresses()).rejects.not.toThrow(
      'private-provider-error',
    );
  }
  h.fetcher.mockResolvedValue({
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () => '{bad',
  } as unknown as Response);
  await expect(new CustomerApi(h.session).addresses()).rejects.toMatchObject({
    kind: 'invalid',
  });
});
