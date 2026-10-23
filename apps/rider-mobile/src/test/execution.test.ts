import { QueryClient } from '@tanstack/react-query';
import { createFixtureRepository, fixtureOwner } from '../features/fixtures';
import { createOperations } from '../features/operations';
import { createJournal, validateCommand } from '../features/execution/journal';
import {
  createExecutionService,
  permitted,
} from '../features/execution/service';
import {
  authority,
  nextTask,
  type Action,
  type Command,
  type ExecutionState,
} from '../features/execution/contracts';
import { ApiError } from '../api/errors';
import { commandRequest, createExecutionApi } from '../api/execution-client';
import { Transport } from '../api/transport';
const clients: QueryClient[] = [];
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const context = {
  assignmentId: 'demo-assignment',
  source: 'RIDER_OFFER_ACCEPTED',
};
const routed = {
  assignmentId: 'demo-assignment',
  source: 'COMMITTED_DISPATCH',
  routeId: 'demo-route',
  revisionId: 'demo-revision',
};
function setup(
  scenario:
    'execution-v1' | 'execution-v2' | 'execution-recovery' = 'execution-v1',
) {
  let raw: string | null = null,
    current = true,
    count = 0;
  const storage = {
    get: jest.fn(async () => raw),
    set: jest.fn(async (value: string) => {
      raw = value;
    }),
    remove: jest.fn(async () => {
      raw = null;
    }),
  };
  const fixture = createFixtureRepository();
  fixture.setScenario(scenario);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  const ops = createOperations(fixture.repository, client, {
    key: ['execute', clients.length],
    owner: fixtureOwner,
    current: () => current,
    onForbidden: async () => {},
  });
  const journal = createJournal(storage);
  const api = { send: jest.fn(fixture.execution.send) };
  const scope = {
    owner: fixtureOwner,
    current: () => current,
    uuid: () => `command-${++count}`,
  };
  const service = createExecutionService(api, journal, client, ops, scope);
  return {
    service,
    journal,
    api,
    storage,
    fixture,
    client,
    ops,
    scope,
    current: () => {
      if (!current) throw new ApiError(0, 'cancelled');
    },
    switchOwner: () => {
      current = false;
    },
    raw: () => raw,
    restart: () =>
      createExecutionService(api, createJournal(storage), client, ops, scope),
  };
}
afterEach(async () => {
  await Promise.all(clients.map((c) => c.cancelQueries()));
  clients.forEach((c) => c.clear());
  clients.length = 0;
});
test('valid V1 assignment start is durable before POST and never invokes a V2 command', async () => {
  const { service, api, raw } = setup();
  const send = api.send.getMockImplementation()!;
  api.send.mockImplementation(async (command, owner) => {
    expect(JSON.parse(raw()!).command).toEqual(command);
    expect(command.kind).toBe('V1_START');
    return send(command, owner);
  });
  const result = await service.run({ ...context, kind: 'V1_START' });
  expect(result?.status).toBe('confirmed');
  expect(api.send).toHaveBeenCalledTimes(1);
});
test('V1 failure leaves assignment active; incident is separate; collected completion comes from backend', async () => {
  const { service, fixture } = setup();
  await service.run({ ...context, kind: 'V1_START' });
  await service.dismiss();
  await service.run({
    ...context,
    kind: 'V1_ATTEMPT',
    pickupId: 'demo-pickup',
    outcome: 'NOT_COLLECTED',
  });
  expect(
    (await fixture.repository.assignment()).assignment?.pickups[0]?.status,
  ).toBe('ASSIGNED');
  await service.dismiss();
  const incident = await service.run({
    ...context,
    kind: 'V1_INCIDENT',
    pickupId: 'demo-pickup',
    reason: 'CUSTOMER_UNAVAILABLE',
  });
  expect(incident?.receipt?.message).toContain('Incident recorded: OPEN');
  expect((await fixture.repository.assignment()).assignment?.status).toBe(
    'ACTIVE',
  );
  await service.dismiss();
  await service.run({
    ...context,
    kind: 'V1_ATTEMPT',
    pickupId: 'demo-pickup',
    outcome: 'COLLECTED',
  });
  expect((await fixture.repository.assignment()).assignment).toBeNull();
});
test('V2 task progression preserves ordering and cannot fall back to legacy execution', async () => {
  const { service, fixture, api } = setup('execution-v2');
  await expect(
    service.run({ ...context, kind: 'V1_START' }),
  ).rejects.toMatchObject({ status: 409 });
  expect(api.send).not.toHaveBeenCalled();
  await service.run({ ...routed, kind: 'V2_ACK' });
  await service.dismiss();
  await service.run({
    ...routed,
    kind: 'V2_TASK',
    taskId: 'demo-task',
    operation: 'DEPART',
  });
  await service.dismiss();
  await service.run({
    ...routed,
    kind: 'V2_TASK',
    taskId: 'demo-task',
    operation: 'START',
  });
  await service.dismiss();
  await service.run({
    ...routed,
    kind: 'V2_TASK',
    taskId: 'demo-task',
    operation: 'PICKUP',
    outcome: 'COLLECTED',
  });
  expect(nextTask((await fixture.repository.route())!)?.kind).toBe('DISCHARGE');
  expect(
    api.send.mock.calls.every(([command]) => command.kind.startsWith('V2_')),
  ).toBe(true);
});
test('non-next task, unstarted collection, stale revision and evidence-free failure never reach POST', async () => {
  const { service, api } = setup('execution-v2');
  for (const action of [
    {
      ...routed,
      kind: 'V2_TASK',
      taskId: 'demo-discharge',
      operation: 'START',
    },
    {
      ...routed,
      kind: 'V2_TASK',
      taskId: 'demo-task',
      operation: 'PICKUP',
      outcome: 'COLLECTED',
    },
    {
      ...routed,
      revisionId: 'old',
      kind: 'V2_TASK',
      taskId: 'demo-task',
      operation: 'START',
    },
  ] as Action[])
    await expect(service.run(action)).rejects.toMatchObject({ status: 409 });
  expect(() =>
    validateCommand({
      ...routed,
      kind: 'V2_TASK',
      id: 'id',
      taskId: 'demo-task',
      operation: 'PICKUP',
      outcome: 'NOT_COLLECTED',
    }),
  ).toThrow();
  expect(api.send).not.toHaveBeenCalled();
});
test('V2 recovery freezes pickup commands and vehicle issue never posts a legacy incident', async () => {
  const { service, api, fixture } = setup('execution-v2');
  await service.run({ ...routed, kind: 'V2_ISSUE', reason: 'SAFETY' });
  await service.dismiss();
  expect((await fixture.repository.route())?.status).toBe('RECOVERY_REQUIRED');
  await expect(
    service.run({
      ...routed,
      kind: 'V2_TASK',
      taskId: 'demo-task',
      operation: 'START',
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(api.send).toHaveBeenCalledTimes(1);
});
test('missing route, unknown source, mismatched assignments and legacy route association fail closed', async () => {
  const { fixture } = setup('execution-v2');
  const state: ExecutionState = {
    assignment: (await fixture.repository.assignment()).assignment,
    route: await fixture.repository.route(),
    availability: await fixture.repository.availability(),
  };
  expect(authority({ ...state, route: null })).toBe('UNAVAILABLE');
  expect(
    authority({
      ...state,
      assignment: { ...state.assignment!, source: 'FUTURE' },
    }),
  ).toBe('UNAVAILABLE');
  expect(
    authority({
      ...state,
      route: { ...state.route!, assignment_id: 'different' },
    }),
  ).toBe('UNAVAILABLE');
  expect(
    authority({
      ...state,
      assignment: { ...state.assignment!, source: 'MANAGER_ASSIGNED' },
    }),
  ).toBe('UNAVAILABLE');
});
test('duplicate taps serialize one durable command and one HTTP request', async () => {
  const { service, api, fixture } = setup();
  const wait = deferred<void>();
  api.send.mockImplementation(async (command, owner) => {
    await wait.promise;
    return fixture.execution.send(command, owner);
  });
  const first = service.run({ ...context, kind: 'V1_START' }),
    second = service.run({ ...context, kind: 'V1_START' });
  expect(first).toBe(second);
  wait.resolve();
  await first;
  expect(api.send).toHaveBeenCalledTimes(1);
});
test('secure persistence failure blocks submission before any physical mutation', async () => {
  const { service, storage, api } = setup();
  storage.set.mockRejectedValueOnce(new Error('private storage failure'));
  await expect(service.run({ ...context, kind: 'V1_START' })).rejects.toThrow();
  expect(api.send).not.toHaveBeenCalled();
});
test('timeout after commit and restart reuse the exact ID/payload with no inferred success', async () => {
  const { service, api, fixture, restart } = setup();
  api.send.mockImplementationOnce(async (command, owner) => {
    await fixture.execution.send(command, owner);
    throw new ApiError(0, 'timeout');
  });
  await expect(
    service.run({ ...context, kind: 'V1_START' }),
  ).rejects.toMatchObject({ kind: 'timeout' });
  const resumed = restart();
  expect((await resumed.load())?.status).toBe('prepared');
  await resumed.replay();
  expect(api.send.mock.calls[1]![0]).toEqual(api.send.mock.calls[0]![0]);
  expect((await resumed.load())?.status).toBe('confirmed');
});
test('ambiguous NOT_COLLECTED preserves the attempt identity, never allocates a second failed attempt', async () => {
  const { service, api, fixture, restart } = setup();
  await service.run({ ...context, kind: 'V1_START' });
  await service.dismiss();
  api.send.mockImplementationOnce(async (command, owner) => {
    await fixture.execution.send(command, owner);
    throw new ApiError(0, 'network');
  });
  await expect(
    service.run({
      ...context,
      kind: 'V1_ATTEMPT',
      pickupId: 'demo-pickup',
      outcome: 'NOT_COLLECTED',
    }),
  ).rejects.toMatchObject({ kind: 'network' });
  await restart().replay();
  expect(api.send.mock.calls[2]![0]).toEqual(api.send.mock.calls[1]![0]);
});
test.each([404, 409, 422])(
  'definite HTTP %i refetches before explicitly dismissing rejection',
  async (status) => {
    const { service, api, fixture } = setup();
    api.send.mockRejectedValueOnce(new ApiError(status));
    const read = jest.spyOn(fixture.repository, 'assignment');
    await expect(
      service.run({ ...context, kind: 'V1_START' }),
    ).rejects.toMatchObject({ status });
    expect((await service.load())?.status).toBe('rejected');
    expect(read.mock.calls.length).toBeGreaterThanOrEqual(2);
    await service.dismiss();
    expect(await service.load()).toBeNull();
  },
);
test.each([401, 403, 500])(
  'HTTP %i does not manufacture confirmation or permit discarding ambiguity',
  async (status) => {
    const { service, api } = setup();
    api.send.mockRejectedValueOnce(new ApiError(status));
    await expect(
      service.run({ ...context, kind: 'V1_START' }),
    ).rejects.toMatchObject({ status });
    expect((await service.load())?.status).toBe('prepared');
    await expect(service.dismiss()).rejects.toMatchObject({ status: 409 });
  },
);
test('server cancellation race refreshes authoritative work and never turns rejection into collection', async () => {
  const { service, api, fixture } = setup();
  await service.run({ ...context, kind: 'V1_START' });
  await service.dismiss();
  api.send.mockImplementationOnce(async () => {
    fixture.setScenario('empty');
    throw new ApiError(409, 'http', 'BOOKING_CANCELLED');
  });
  await expect(
    service.run({
      ...context,
      kind: 'V1_ATTEMPT',
      pickupId: 'demo-pickup',
      outcome: 'COLLECTED',
    }),
  ).rejects.toMatchObject({ code: 'BOOKING_CANCELLED' });
  expect((await service.load())?.status).toBe('rejected');
  expect((await fixture.repository.assignment()).assignment).toBeNull();
});
test('replaced work cannot be retargeted when recovering an interrupted command', async () => {
  const { service, api, fixture, restart } = setup();
  api.send.mockRejectedValueOnce(new ApiError(0, 'timeout'));
  await expect(service.run({ ...context, kind: 'V1_START' })).rejects.toThrow();
  fixture.setScenario('empty');
  await expect(restart().replay()).rejects.toMatchObject({ status: 409 });
  expect(api.send).toHaveBeenCalledTimes(1);
  expect((await service.load())?.status).toBe('prepared');
});
test('logout during a late command response suppresses its receipt and ordered clear removes recovery', async () => {
  const { service, api, journal, switchOwner, storage } = setup();
  const pending = deferred<{ resourceId: string; message: string }>();
  api.send.mockReturnValue(pending.promise);
  const result = service.run({ ...context, kind: 'V1_START' });
  await new Promise((done) => setTimeout(done, 0));
  switchOwner();
  await journal.clear();
  pending.resolve({ resourceId: 'demo-assignment', message: 'start' });
  await expect(result).rejects.toMatchObject({ kind: 'cancelled' });
  expect(await storage.get()).toBeNull();
});
test('journal rejects edited payloads/corrupt records and never exposes another account command', async () => {
  const { journal, storage, current } = setup();
  const command: Command = { ...context, kind: 'V1_START', id: 'stable-id' };
  await journal.prepare(fixtureOwner, command, current);
  await expect(
    journal.update(
      fixtureOwner,
      { ...command, assignmentId: 'edited' },
      {
        status: 'confirmed',
        receipt: { resourceId: 'id', message: 'x' },
        rejection: null,
      },
      current,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(await journal.load('other-owner', current)).toBeNull();
  expect(await storage.get()).toBeNull();
  storage.get.mockResolvedValueOnce('{malformed');
  await expect(journal.load(fixtureOwner, current)).rejects.toMatchObject({
    kind: 'protocol',
  });
});
test('exact HTTP payload reconstruction preserves stable V1/V2 IDs and contains no invented manager or evidence fields', () => {
  expect(
    commandRequest({
      ...context,
      kind: 'V1_INCIDENT',
      id: 'incident',
      pickupId: 'pickup',
      reason: 'OTHER',
    }),
  ).toEqual({
    path: '/v1/rider/pickups/pickup/incidents',
    body: { client_incident_id: 'incident', reason_code: 'OTHER' },
  });
  expect(
    commandRequest({
      ...routed,
      kind: 'V2_TASK',
      id: 'command',
      taskId: 'task',
      operation: 'PICKUP',
      outcome: 'COLLECTED',
    }),
  ).toEqual({
    path: '/v2/rider/route-tasks',
    body: {
      client_command_id: 'command',
      task_id: 'task',
      revision_id: 'demo-revision',
      operation: 'PICKUP',
      outcome: 'COLLECTED',
    },
  });
});
test('controlled backend guard codes are retained, while raw private details are discarded', async () => {
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 409,
      headers: { get: () => 'application/json' },
      json: async () => ({ detail: 'FRESH_POSITION_REQUIRED' }),
    })
    .mockResolvedValueOnce({
      ok: false,
      status: 409,
      headers: { get: () => 'application/json' },
      json: async () => ({ detail: 'private coordinates or credentials' }),
    });
  const api = createExecutionApi(
    new Transport(
      'https://rider.example',
      { accessToken: () => 'token', refresh: jest.fn(), clear: jest.fn() },
      () => '',
      fetcher,
    ),
  );
  const command: Command = { ...routed, kind: 'V2_ACK', id: 'ack' };
  await expect(api.send(command, fixtureOwner)).rejects.toMatchObject({
    status: 409,
    code: 'FRESH_POSITION_REQUIRED',
  });
  await expect(api.send(command, fixtureOwner)).rejects.toMatchObject({
    code: undefined,
  });
});
test('stale-revision recovery replays the original committed task identity instead of rebuilding its payload', async () => {
  const { service, api, fixture, restart } = setup('execution-v2');
  api.send.mockImplementationOnce(async (command, owner) => {
    await fixture.execution.send(command, owner);
    throw new ApiError(0, 'timeout');
  });
  await expect(
    service.run({
      ...routed,
      kind: 'V2_TASK',
      taskId: 'demo-task',
      operation: 'START',
    }),
  ).rejects.toThrow();
  const route = (await fixture.repository.route())!;
  jest
    .spyOn(fixture.repository, 'route')
    .mockResolvedValue({ ...route, revision_id: 'new-revision' });
  await restart().replay();
  expect(api.send.mock.calls[1]![0]).toEqual(api.send.mock.calls[0]![0]);
  expect(api.send.mock.calls[1]![0].revisionId).toBe('demo-revision');
});
test('conflicting replay never changes the original outcome under the same command ID', async () => {
  const { fixture } = setup();
  await fixture.execution.send(
    { ...context, kind: 'V1_START', id: 'start' },
    fixtureOwner,
  );
  const command: Command = {
    ...context,
    kind: 'V1_ATTEMPT',
    pickupId: 'demo-pickup',
    outcome: 'NOT_COLLECTED',
    id: 'attempt',
  };
  const first = await fixture.execution.send(command, fixtureOwner);
  expect(await fixture.execution.send(command, fixtureOwner)).toEqual(first);
  await expect(
    fixture.execution.send({ ...command, outcome: 'COLLECTED' }, fixtureOwner),
  ).rejects.toMatchObject({ status: 409 });
});
test('logout ordered behind a delayed secure write prevents stale recovery resurrection', async () => {
  const { service, api, journal, storage, switchOwner } = setup();
  const entered = deferred<void>(),
    release = deferred<void>();
  const set = storage.set.getMockImplementation()!;
  storage.set.mockImplementationOnce(async (value) => {
    entered.resolve();
    await release.promise;
    await set(value);
  });
  const running = service.run({ ...context, kind: 'V1_START' });
  await entered.promise;
  switchOwner();
  const clearing = journal.clear();
  release.resolve();
  await expect(running).rejects.toMatchObject({ kind: 'cancelled' });
  await clearing;
  expect(await storage.get()).toBeNull();
  expect(api.send).not.toHaveBeenCalled();
});
test('recovery payload rejects sensitive fields and unsupported physical/evidence commands', () => {
  for (const field of [
    'latitude',
    'pickup_address',
    'refresh_token',
    'roles',
    'client_capture_id',
  ])
    expect(() =>
      validateCommand({
        ...context,
        kind: 'V1_START',
        id: 'id',
        [field]: 'private',
      }),
    ).toThrow();
  expect(() =>
    validateCommand({
      ...routed,
      kind: 'V2_TASK',
      operation: 'DISCHARGE',
      taskId: 'task',
      id: 'id',
    }),
  ).toThrow();
});
test('unknown task states cannot be skipped to execute a later familiar task', async () => {
  const { fixture } = setup('execution-v2');
  const route = (await fixture.repository.route())!;
  route.tasks = [
    { ...route.tasks[0]!, task_id: 'unknown-first', state: 'FUTURE_STATE' },
    route.tasks[0]!,
  ];
  const state = {
    assignment: (await fixture.repository.assignment()).assignment,
    route,
    availability: await fixture.repository.availability(),
  };
  expect(nextTask(route)).toBeUndefined();
  expect(
    permitted(
      { ...routed, kind: 'V2_TASK', taskId: 'demo-task', operation: 'START' },
      state,
    ),
  ).toBe(false);
});
