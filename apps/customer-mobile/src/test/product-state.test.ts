import {
  createDevelopmentRepositories,
  developmentAddresses,
} from '../features/collection/developmentRepositories';
import {
  approximateDistanceKm,
  needsAddressConfirmation,
  addressIdentity,
} from '../features/addresses/distance';
import { serviceabilityState } from '../features/collection/serviceabilityState';
import { SessionStore, type Principal } from '../session/store';
import { productAdmission } from '../session/admission';
import { ApiError } from '../api/errors';
import { isDevelopmentPreview, capabilityGate } from '../api/capabilities';
import { trustedMediaUrl } from '../features/media/model';
import { refundLabels } from '../features/collection/financial';
import { PushLifecycle } from '../notifications/lifecycle';
import {
  collectionSignal,
  notificationDispatcher,
} from '../notifications/signals';

const login = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_in: 60,
  token_type: 'bearer',
  user_id: 'customer',
};
function store(read: () => Promise<Principal>) {
  const secure = {
      get: jest.fn().mockResolvedValue('refresh'),
      set: jest.fn(),
      remove: jest.fn(),
    },
    cleared = jest.fn();
  return {
    secure,
    cleared,
    session: new SessionStore(secure, async () => login, cleared, { read }),
  };
}
test('OTP credentials survive a transient principal failure; guards retry until authoritative CUSTOMER admission', async () => {
  const read = jest
    .fn()
    .mockRejectedValueOnce(new ApiError(503))
    .mockResolvedValueOnce({ userId: 'customer', roles: ['CUSTOMER'] });
  const { session, secure } = store(read);
  await expect(session.establish(login)).resolves.toBeUndefined();
  expect(session.accessToken()).toBe('access');
  expect(secure.remove).not.toHaveBeenCalled();
  expect(productAdmission(session.getSnapshot(), false)).toBe('retry');
  await session.loadPrincipal();
  expect(productAdmission(session.getSnapshot(), false)).toBe('admitted');
});
test('a principal 401 revokes credentials; non-CUSTOMER principal fails closed without clearing', async () => {
  const revoked = store(async () => {
    throw new ApiError(401);
  });
  await revoked.session.establish(login);
  expect(productAdmission(revoked.session.getSnapshot(), false)).toBe('login');
  expect(revoked.secure.remove).toHaveBeenCalledTimes(1);
  const rider = store(async () => ({ userId: 'customer', roles: ['RIDER'] }));
  await rider.session.establish(login);
  expect(productAdmission(rider.session.getSnapshot(), false)).toBe(
    'forbidden',
  );
  expect(rider.secure.remove).not.toHaveBeenCalled();
});
test('logout and account switching ignore a late principal and clear the previous owner', async () => {
  let resolve!: (value: Principal) => void;
  const read = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Principal>((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue({ userId: 'second', roles: ['CUSTOMER'] });
  const { session, cleared } = store(read),
    pending = session.establish(login);
  await new Promise((done) => setTimeout(done, 0));
  await session.establish({ ...login, user_id: 'second' });
  resolve({ userId: 'customer', roles: ['CUSTOMER'] });
  await pending;
  expect(session.getSnapshot().principal?.userId).toBe('second');
  expect(cleared).toHaveBeenCalledTimes(1);
  await session.clear();
  expect(session.getSnapshot().principal).toBeNull();
  expect(session.accessToken()).toBeNull();
});
test('release ignores preview flag and unavailable proposed capability never starts a network request', () => {
  expect(isDevelopmentPreview(false, 'true')).toBe(false);
  expect(isDevelopmentPreview(true, 'true')).toBe(true);
  expect(() => capabilityGate(new Set())('catalogue')).toThrow(ApiError);
});
test('distance warning is local, optional and bound to address version and pin', () => {
  const home = developmentAddresses[0]!,
    temple = developmentAddresses[1]!;
  expect(needsAddressConfirmation(home, null, null)).toBeNull();
  expect(
    needsAddressConfirmation({ ...home, location: null }, home.location, null),
  ).toBeNull();
  expect(needsAddressConfirmation(home, home.location, null)).toBeNull();
  expect(needsAddressConfirmation(temple, home.location, null)).toBeGreaterThan(
    5,
  );
  expect(
    needsAddressConfirmation(temple, home.location, addressIdentity(temple)),
  ).toBeNull();
  expect(
    needsAddressConfirmation(
      { ...temple, version: 2 },
      home.location,
      addressIdentity(temple),
    ),
  ).toBeGreaterThan(5);
  expect(
    approximateDistanceKm({ latitude: NaN, longitude: 0 }, home.location!),
  ).toBeNull();
});
test('serviceability checks exact address/version, expiry and terminal technical failures', async () => {
  const repo = createDevelopmentRepositories(),
    home = developmentAddresses[0]!,
    context = await repo.serviceability(home).execute(),
    now = Date.now();
  expect(serviceabilityState(context, home, now)).toBe('serviceable');
  expect(serviceabilityState(context, { ...home, version: 2 }, now)).toBe(
    'missing',
  );
  expect(
    serviceabilityState(
      { ...context, expires_at: new Date(now).toISOString() },
      home,
      now,
    ),
  ).toBe('expired');
  expect(
    serviceabilityState({ ...context, status: 'UNSERVICEABLE' }, home, now),
  ).toBe('unserviceable');
  expect(
    serviceabilityState({ ...context, status: 'TECHNICAL_FAILURE' }, home, now),
  ).toBe('technicalFailure');
});
test('history pages contain owned detail snapshots, all refund states and no duplicate records', async () => {
  const repo = createDevelopmentRepositories(),
    records = [];
  let cursor: string | null = null;
  do {
    const page = await repo.collections('history', cursor);
    records.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  expect(new Set(records.map((record) => record.request_id)).size).toBe(
    records.length,
  );
  expect(
    new Set(records.map((record) => record.refund_status).filter(Boolean)),
  ).toEqual(
    new Set(['INITIATED', 'PROCESSING', 'COMPLETED', 'CONFIRMING', 'FAILED']),
  );
  const detail = await repo.detail(records[0]!.request_id);
  expect(detail.address.text).toContain('Preview');
  expect(detail.quote.amount_minor).toBe(35000);
  await expect(repo.detail('unknown')).rejects.toMatchObject({ status: 404 });
});

test('development recommendations come from completed collections and unpaid journeys remain upcoming', async () => {
  const repo = createDevelopmentRepositories();
  const completed = await repo.detail('55555555-5555-4555-8555-555555555555');
  const recommendations = await repo.recommendations();
  expect(
    recommendations.recommendations.map((item) => item.category_code).sort(),
  ).toEqual([...completed.category_codes].sort());
  const pending = await repo.detail('88888888-8888-4888-8888-888888888888');
  expect(pending.journey_status).toBe('NOT_STARTED');
  expect(
    pending.journey.milestones.every((step) => step.state === 'UPCOMING'),
  ).toBe(true);
  await expect(repo.slots('unknown-context')).rejects.toMatchObject({
    status: 409,
    code: 'SERVICEABILITY_EXPIRED',
  });
});
test('cancellation replay creates a single refund intent and preserves separate completion truth', async () => {
  const repo = createDevelopmentRepositories(),
    id = '11111111-1111-4111-8111-111111111111',
    detail = await repo.detail(id),
    command = repo.cancel(id, detail.cancellation);
  await command.execute();
  await command.execute();
  expect((await repo.detail(id)).status).toBe('CANCELLED');
  expect((await repo.refunds(id)).refunds).toHaveLength(1);
  expect((await repo.refunds(id)).refunds[0]?.status).toBe('INITIATED');
  expect((await repo.refunds(id)).refunds[0]?.completed_at).toBeNull();
});
test('planning races refetch to ineligible; uncertain cancellation retries same prepared command', async () => {
  const repo = createDevelopmentRepositories(),
    race = '33333333-3333-4333-8333-333333333333',
    retry = '44444444-4444-4444-8444-444444444444';
  await expect(
    repo.cancel(race, (await repo.detail(race)).cancellation).execute(),
  ).rejects.toMatchObject({ status: 409, code: 'PLANNING_STARTED' });
  expect((await repo.detail(race)).cancellation.allowed).toBe(false);
  expect((await repo.refunds(race)).refunds).toEqual([]);
  const command = repo.cancel(retry, (await repo.detail(retry)).cancellation);
  await expect(command.execute()).rejects.toMatchObject({ kind: 'network' });
  await expect(command.execute()).resolves.toMatchObject({
    status: 'CANCELLED',
  });
});
test('media allows safe remote HTTPS only and customer refund text never exposes internal uncertainty', () => {
  expect(trustedMediaUrl('https://cdn.example/image.webp')).toContain(
    'cdn.example',
  );
  for (const value of [
    'http://cdn.example/image',
    'https://user:secret@cdn.example/image',
    'file:///private',
    'javascript:alert(1)',
  ])
    expect(trustedMediaUrl(value)).toBeNull();
  expect(refundLabels.CONFIRMING).toBe('Refund awaiting confirmation');
  expect(Object.keys(refundLabels)).not.toContain('INITIATION_UNCERTAIN');
});
test('push uses provider by platform, serializes rotations, revokes and blocks callbacks after clear', async () => {
  const register = jest.fn().mockResolvedValue({}),
    revoke = jest.fn().mockResolvedValue(undefined),
    bodies: unknown[] = [];
  const lifecycle = new PushLifecycle(
    {
      registerPush: (body) => {
        bodies.push(body);
        return { execute: register };
      },
      revokePush: () => ({ execute: revoke }),
    },
    async () => 'installation',
    () => 'customer',
  );
  await Promise.all([
    lifecycle.register('ANDROID', 'first'),
    lifecycle.register('ANDROID', 'rotated'),
  ]);
  await lifecycle.register('IOS', 'apns');
  expect(bodies).toEqual([
    expect.objectContaining({ token_provider: 'FCM', token: 'first' }),
    expect.objectContaining({ token_provider: 'FCM', token: 'rotated' }),
    expect.objectContaining({ token_provider: 'APNS', token: 'apns' }),
  ]);
  expect(lifecycle.state()).toBe('registered');
  await lifecycle.revoke();
  expect(revoke).toHaveBeenCalledTimes(1);
  expect(lifecycle.state()).toBe('idle');
  const pending = lifecycle.register('IOS', 'late');
  lifecycle.clear();
  await pending;
  expect(register).toHaveBeenCalledTimes(3);
});
test('minimal push payload navigates to owned detail, deduplicates event ids and ignores arbitrary routes/state', () => {
  const refetch = jest.fn(),
    navigate = jest.fn(),
    dispatcher = notificationDispatcher(refetch, navigate),
    data = {
      schema_version: 1,
      event_id: 'event_1',
      target: 'COLLECTION',
      request_id: '11111111-1111-4111-8111-111111111111',
    };
  dispatcher.tap({ identifier: 'a', data });
  dispatcher.tap({ identifier: 'b', data });
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith({
    pathname: '/collections/[requestId]',
    params: { requestId: data.request_id },
  });
  expect(refetch).toHaveBeenCalledTimes(2);
  expect(
    collectionSignal({ route: '/manager', status: 'COMPLETED' }),
  ).toBeNull();
});
