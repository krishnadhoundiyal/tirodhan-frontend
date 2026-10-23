import { QueryClient } from '@tanstack/react-query';
import { createOperations, offerActionable } from '../features/operations';
import { createFixtureRepository, fixtureOwner } from '../features/fixtures';
import { ApiError } from '../api/errors';
import type { Availability, AssignmentEnvelope, Offer } from '../api/contracts';
const clients: QueryClient[] = [];
const now = Date.parse('2026-10-23T10:00:00Z');
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  const fixtures = createFixtureRepository(() => now);
  const repository = fixtures.repository;
  let current = true;
  const forbidden = jest.fn(async () => {});
  const operations = createOperations(
    repository,
    client,
    {
      key: ['test', clients.length],
      owner: fixtureOwner,
      current: () => current,
      onForbidden: forbidden,
    },
    () => now,
  );
  return {
    client,
    fixtures,
    repository,
    operations,
    forbidden,
    changeOwner: () => {
      current = false;
    },
  };
}
afterEach(async () => {
  await Promise.all(clients.map((client) => client.cancelQueries()));
  clients.forEach((client) => client.clear());
  clients.length = 0;
});
test('availability preserves server work state and sends exactly the displayed version', async () => {
  const { operations, repository, client } = setup();
  await operations.refresh();
  const put = jest.spyOn(repository, 'setAvailability');
  await operations.setAvailability('AVAILABLE', 1);
  expect(put).toHaveBeenCalledWith('AVAILABLE', 1);
  expect(client.getQueryData(operations.key('availability'))).toMatchObject({
    availability_intent: 'AVAILABLE',
    work_state: 'IDLE',
    version: 2,
  });
});
test('version conflict refreshes the server version without a silent overwrite/retry', async () => {
  const { operations, fixtures, repository, client } = setup();
  await operations.refresh();
  fixtures.setScenario('conflict');
  const put = jest.spyOn(repository, 'setAvailability');
  await expect(
    operations.setAvailability('AVAILABLE', 1),
  ).rejects.toMatchObject({ status: 409 });
  expect(put).toHaveBeenCalledTimes(1);
  expect(
    client.getQueryData<Availability>(operations.key('availability'))?.version,
  ).toBe(2);
});
test('stale cached version is rejected before sending a command', async () => {
  const { operations, repository } = setup();
  await operations.refresh();
  const put = jest.spyOn(repository, 'setAvailability');
  await expect(
    operations.setAvailability('AVAILABLE', 5),
  ).rejects.toMatchObject({ status: 409 });
  expect(put).not.toHaveBeenCalled();
});
test('duplicate availability taps share a single command', async () => {
  const { operations, repository } = setup();
  await operations.refresh();
  const result = deferred<Availability>();
  const put = jest
    .spyOn(repository, 'setAvailability')
    .mockReturnValue(result.promise);
  const first = operations.setAvailability('AVAILABLE', 1),
    second = operations.setAvailability('OFFLINE', 1);
  expect(first).toBe(second);
  expect(put).toHaveBeenCalledTimes(1);
  result.resolve({ ...(await repository.availability()), version: 2 });
  await first;
});
test('acceptance acknowledgement triggers authoritative assignment, route and availability reads', async () => {
  const { operations, client, repository } = setup();
  await operations.refresh();
  const assignmentRead = jest.spyOn(repository, 'assignment');
  await operations.accept('demo-offer');
  expect(assignmentRead).toHaveBeenCalledTimes(1);
  expect(
    client.getQueryData<AssignmentEnvelope>(operations.key('assignment'))
      ?.assignment?.assignment_id,
  ).toBe('demo-assignment');
  expect(client.getQueryData<Offer[]>(operations.key('offers'))).toEqual([]);
});
test.each(['expired', 'conflict'] as const)(
  '%s offer never fabricates assignment success',
  async (scenario) => {
    const { operations, fixtures, client, repository } = setup();
    fixtures.setScenario(scenario);
    await operations.refresh();
    const accept = jest.spyOn(repository, 'accept');
    await expect(operations.accept('demo-offer')).rejects.toMatchObject({
      status: 409,
    });
    expect(
      client.getQueryData<AssignmentEnvelope>(operations.key('assignment'))
        ?.assignment,
    ).toBeNull();
    expect(accept).toHaveBeenCalledTimes(scenario === 'expired' ? 0 : 1);
  },
);
test('duplicate acceptance, including different buttons, cannot race two submissions', async () => {
  const { operations, repository } = setup();
  await operations.refresh();
  const summary = await createFixtureRepository(() => now).repository.accept(
    'demo-offer',
  );
  const result = deferred<typeof summary>();
  const accept = jest
    .spyOn(repository, 'accept')
    .mockReturnValue(result.promise);
  const first = operations.accept('demo-offer'),
    second = operations.accept('other-offer');
  expect(first).toBe(second);
  result.resolve(summary);
  await first;
  expect(accept).toHaveBeenCalledTimes(1);
});
test('withdrawal/not-found refreshes authoritative work and never retries acceptance automatically', async () => {
  const { operations, repository } = setup();
  await operations.refresh();
  const accept = jest
    .spyOn(repository, 'accept')
    .mockRejectedValue(new ApiError(404));
  const read = jest.spyOn(repository, 'offers');
  await expect(operations.accept('demo-offer')).rejects.toMatchObject({
    status: 404,
  });
  expect(accept).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledTimes(1);
});
test('historical acceptance replay does not invent an active assignment from the POST summary', async () => {
  const { operations, repository, client } = setup();
  await operations.refresh();
  const historical = await createFixtureRepository(() => now).repository.accept(
    'demo-offer',
  );
  jest
    .spyOn(repository, 'accept')
    .mockResolvedValue({ ...historical, status: 'COMPLETED' });
  await operations.accept('demo-offer');
  expect(
    client.getQueryData<AssignmentEnvelope>(operations.key('assignment'))
      ?.assignment,
  ).toBeNull();
});
test('manager recovery changes replace assignment data on the next authoritative refresh', async () => {
  const { operations, fixtures, client } = setup();
  fixtures.setScenario('active');
  await operations.refresh();
  expect(
    client.getQueryData<AssignmentEnvelope>(operations.key('assignment'))
      ?.assignment,
  ).not.toBeNull();
  fixtures.setScenario('empty');
  await operations.refresh();
  expect(
    client.getQueryData<AssignmentEnvelope>(operations.key('assignment'))
      ?.assignment,
  ).toBeNull();
  expect(client.getQueryData(operations.key('route'))).toBeNull();
});
test('session change suppresses a late assignment read and a late acceptance acknowledgement', async () => {
  const { operations, repository, client, changeOwner } = setup();
  await operations.refresh();
  const result = deferred<AssignmentEnvelope>();
  jest.spyOn(repository, 'assignment').mockReturnValue(result.promise);
  const reading = client.fetchQuery(operations.query('assignment'));
  changeOwner();
  result.resolve({ assignment: null });
  await expect(reading).rejects.toMatchObject({ kind: 'cancelled' });
  await expect(operations.accept('demo-offer')).rejects.toMatchObject({
    kind: 'cancelled',
  });
});
test('account switch during accept prevents publication and subsequent refresh for the next owner', async () => {
  const { operations, repository, changeOwner } = setup();
  await operations.refresh();
  const summary = await createFixtureRepository(() => now).repository.accept(
    'demo-offer',
  );
  const result = deferred<typeof summary>();
  jest.spyOn(repository, 'accept').mockReturnValue(result.promise);
  const read = jest.spyOn(repository, 'assignment');
  const accepting = operations.accept('demo-offer');
  changeOwner();
  result.resolve(summary);
  await expect(accepting).rejects.toMatchObject({ kind: 'cancelled' });
  expect(read).not.toHaveBeenCalled();
});
test('a backend 403 rechecks admission without refreshing tokens or retrying the mutation', async () => {
  const { operations, repository, forbidden } = setup();
  await operations.refresh();
  const accept = jest
    .spyOn(repository, 'accept')
    .mockRejectedValue(new ApiError(403));
  await expect(operations.accept('demo-offer')).rejects.toMatchObject({
    status: 403,
  });
  expect(forbidden).toHaveBeenCalledTimes(1);
  expect(accept).toHaveBeenCalledTimes(1);
});
test('network errors remain errors and backend work state is not inferred from requested intent', async () => {
  const { operations, fixtures, client } = setup();
  fixtures.setScenario('network');
  await operations.refresh();
  expect(client.getQueryState(operations.key('assignment'))?.status).toBe(
    'error',
  );
  expect(client.getQueryData(operations.key('availability'))).toBeUndefined();
});
test.each(['CLOSED_LOST', 'ACCEPTED', 'FUTURE_UNKNOWN'])(
  'non-open %s cannot be accepted',
  (status) => {
    expect(
      offerActionable(
        {
          offer_id: 'id',
          collection_group_id: 'group',
          status,
          offer_round: 1,
          offered_at: new Date(now).toISOString(),
          expires_at: new Date(now + 1).toISOString(),
        },
        now,
      ),
    ).toBe(false);
  },
);
test('a cancelled stale read cannot replace a newer manager recovery result', async () => {
  const { operations, fixtures, client, repository } = setup();
  fixtures.setScenario('active');
  const old = await repository.assignment();
  const pending = deferred<AssignmentEnvelope>();
  jest
    .spyOn(repository, 'assignment')
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValue({ assignment: null });
  const first = client
    .fetchQuery(operations.query('assignment'))
    .catch(() => {});
  await operations.refresh();
  pending.resolve(old);
  await first;
  expect(
    client.getQueryData<AssignmentEnvelope>(operations.key('assignment'))
      ?.assignment,
  ).toBeNull();
});
