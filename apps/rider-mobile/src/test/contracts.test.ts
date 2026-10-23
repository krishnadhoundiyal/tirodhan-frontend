import { createAuthApi, createRiderApi } from '../api/client';
import { Transport } from '../api/transport';
import {
  parseAssignment,
  parseAvailability,
  parseRoute,
  parseOffers,
} from '../api/parse';
import { createFixtureRepository } from '../features/fixtures';
import { riderSignal, pushRegistrationStatus } from '../notifications/signals';
const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;
test('Rider mutations use precise backend paths/body with no role/manager command/idempotency header', async () => {
  const fixtures = createFixtureRepository();
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(ok(await fixtures.repository.availability()))
    .mockResolvedValueOnce(ok(await fixtures.repository.accept('demo-offer')));
  const api = createRiderApi(
    new Transport(
      'https://rider.example',
      {
        accessToken: () => 'memory-access',
        refresh: jest.fn(),
        clear: jest.fn(),
      },
      () => 'unused',
      fetcher,
    ),
  );
  await api.setAvailability('AVAILABLE', 4);
  await api.accept('offer/with?reserved');
  expect(fetcher.mock.calls[0]).toMatchObject([
    'https://rider.example/v1/rider/me/availability',
    {
      method: 'PUT',
      body: JSON.stringify({ intent: 'AVAILABLE', expected_version: 4 }),
    },
  ]);
  expect(fetcher.mock.calls[1]).toMatchObject([
    'https://rider.example/v1/rider/offers/offer%2Fwith%3Freserved/accept',
    { method: 'POST', body: undefined },
  ]);
  expect(fetcher.mock.calls[1]![1].headers).not.toHaveProperty(
    'Idempotency-Key',
  );
  expect(fetcher.mock.calls[1]![1].headers).not.toHaveProperty('X-Role');
});
test('read endpoint mapping keeps null route and null assignment distinct', async () => {
  const fixture = createFixtureRepository();
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(ok(await fixture.repository.availability()))
    .mockResolvedValueOnce(ok([]))
    .mockResolvedValueOnce(ok({ assignment: null }))
    .mockResolvedValueOnce(ok(null))
    .mockResolvedValueOnce(ok({ user_id: 'rider', roles: ['RIDER'] }));
  const api = createRiderApi(
    new Transport(
      'https://rider.example',
      { accessToken: () => 'token', refresh: jest.fn(), clear: jest.fn() },
      () => '',
      fetcher,
    ),
  );
  await api.availability();
  await api.offers();
  expect(await api.assignment()).toEqual({ assignment: null });
  expect(await api.route()).toBeNull();
  await api.principal();
  expect(fetcher.mock.calls.map((call) => call[0])).toEqual(
    [
      '/v1/rider/me/availability',
      '/v1/rider/me/offers',
      '/v1/rider/me/assignment',
      '/v2/rider/route',
      '/v1/auth/me',
    ].map((path) => `https://rider.example${path}`),
  );
});
test('auth protocol has exact public OTP, stable refresh and logout shapes', async () => {
  const token = {
    access_token: 'memory',
    token_type: 'bearer',
    expires_in: 120,
    user_id: 'rider',
  };
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(ok({ challenge_reference: 'challenge' }))
    .mockResolvedValueOnce(ok({ ...token, refresh_token: 'secure' }))
    .mockResolvedValueOnce(ok(token))
    .mockResolvedValueOnce({ ok: true, status: 204 });
  const api = createAuthApi(
    new Transport(
      'https://rider.example',
      { accessToken: () => null, refresh: jest.fn(), clear: jest.fn() },
      () => '',
      fetcher,
    ),
  );
  await api.startOtp({ client_request_id: 'request', phone: '+919999999999' });
  await api.verifyOtp({
    client_login_id: 'login',
    challenge_reference: 'challenge',
    code: '123456',
  });
  await api.refresh('secure');
  await api.logout('secure');
  expect(fetcher.mock.calls.map((call) => call[0])).toEqual(
    ['otp/start', 'otp/verify', 'refresh', 'logout'].map(
      (path) => `https://rider.example/v1/auth/${path}`,
    ),
  );
  expect(fetcher.mock.calls[2]![1].body).toBe(
    JSON.stringify({ refresh_token: 'secure' }),
  );
  expect(
    fetcher.mock.calls.every((call) => !call[1].headers.Authorization),
  ).toBe(true);
});
test('runtime decoders preserve unknown display states but reject malformed actionable data', async () => {
  const fixtures = createFixtureRepository();
  const availability = await fixtures.repository.availability();
  expect(
    parseAvailability({ ...availability, work_state: 'FUTURE_STATE' })
      .work_state,
  ).toBe('FUTURE_STATE');
  expect(() => parseAvailability({ ...availability, version: 0 })).toThrow();
  expect(() => parseOffers([{ status: 'OPEN' }])).toThrow();
  expect(() => parseAssignment(null)).toThrow();
  expect(() => parseRoute({ tasks: [] })).toThrow();
});
test('route tasks retain backend order and contain no fabricated location or ETA', async () => {
  const fixtures = createFixtureRepository();
  fixtures.setScenario('active');
  const route = (await fixtures.repository.route())!;
  route.tasks = [
    { ...route.tasks[0]!, task_id: 'z' },
    { ...route.tasks[0]!, task_id: 'a' },
  ];
  expect(parseRoute(route)?.tasks.map((task) => task.task_id)).toEqual([
    'z',
    'a',
  ]);
  expect(parseRoute(route)).not.toHaveProperty('eta');
});
test('FCM payloads are refresh hints, and registration is explicitly gated', () => {
  expect(
    riderSignal({
      type: 'ASSIGNMENT_OFFER',
      collection_group_id: 'group',
      offer_round: '1',
    }),
  ).toBe('offers');
  expect(riderSignal({ type: 'ROUTE_REVISION', revision_id: 'revision' })).toBe(
    'route',
  );
  expect(
    riderSignal({ type: 'ASSIGNMENT_OFFER', offer_id: 'invented' }),
  ).toBeNull();
  expect(pushRegistrationStatus.enabled).toBe(false);
});
