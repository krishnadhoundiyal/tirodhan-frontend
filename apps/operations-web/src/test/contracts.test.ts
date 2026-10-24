import { reads, isManagerRead } from '../api/reads';
import { ContractError } from '../api/schema';
import { fixtureId, fixturePayload, scenarios } from '../preview/fixtures';

const specifications = [
  reads.regions(),
  reads.lineage(fixtureId(55)),
  reads.transfers(fixtureId(55)),
  reads.riders(),
  reads.groups(),
  reads.incidents(),
  reads.route(fixtureId(30)),
  reads.recovery(fixtureId(2)),
  reads.failure(fixtureId(40)),
  reads.replacements(),
  reads.replacement(fixtureId(50)),
  reads.evaluations(fixtureId(50)),
  reads.capacity(fixtureId(60)),
  reads.backlog(),
  reads.fleet(),
];
test.each(scenarios)(
  'strictly parses every supported response in the %s fixture',
  (scenario) => {
    for (const spec of specifications)
      expect(() =>
        spec.parse(fixturePayload(spec.path, scenario)),
      ).not.toThrow();
  },
);
test.each(specifications)(
  'rejects malformed or incomplete response for $path',
  (spec) => {
    for (const invalid of [null, 'raw error', true, {}, [null]])
      expect(() => spec.parse(invalid)).toThrow(ContractError);
  },
);
test('rider parser rejects missing states and does not infer eligibility', () => {
  const spec = reads.riders();
  const [row] = fixturePayload(spec.path, 'Normal workload') as Record<
    string,
    unknown
  >[];
  expect(() => spec.parse([{ ...row, work_state: undefined }])).toThrow();
  expect(() => spec.parse([{ ...row, version: '2' }])).toThrow();
  const parsed = spec.parse([
    {
      ...row,
      work_state: 'FUTURE_SERVER_STATE',
      phone: 'never retain household data',
      location: { lat: 1, lon: 2 },
    },
  ]);
  expect(parsed[0].work_state).toBe('FUTURE_SERVER_STATE');
  expect(parsed[0]).not.toHaveProperty('phone');
  expect(parsed[0]).not.toHaveProperty('location');
});
test('route tasks retain authoritative order and current revision identity', () => {
  const spec = reads.route(fixtureId(30));
  const result = spec.parse(fixturePayload(spec.path, 'Rider failure'));
  expect(result.status).toBe('RECOVERY_REQUIRED');
  expect(result.revision_id).toBe(fixtureId(34));
  expect(result.tasks.map((task) => task.kind)).toEqual([
    'PICKUP',
    'DISCHARGE',
  ]);
  expect(result).not.toHaveProperty('rider_id');
  expect(result).not.toHaveProperty('source');
});
test('pending replacement and completed activation/custody remain distinct', () => {
  const spec = reads.replacement(fixtureId(50));
  const pending = spec.parse(fixturePayload(spec.path, 'Recovery pending'));
  expect(pending).toMatchObject({
    status: 'APPROVED',
    activation_state: 'PENDING',
    authoritative: false,
    custody_transferred: false,
    activation_id: null,
  });
  const completed = spec.parse(
    fixturePayload(spec.path, 'Reassignment completed'),
  );
  expect(completed).toMatchObject({
    status: 'COMPLETED',
    activation_state: 'ACTIVATED',
    authoritative: true,
    custody_transferred: true,
  });
});
test('paginated reads preserve backend cursor names without fabricating offsets or sort keys', () => {
  const id = fixtureId(200);
  expect(reads.backlog(id).path).toContain(`after_request_id=${id}`);
  expect(reads.replacements(id).path).toContain(`after_id=${id}`);
  expect(reads.capacity(fixtureId(60), id).path).toContain(
    `after_vehicle_id=${id}`,
  );
  expect(reads.failure(fixtureId(40), id, fixtureId(201)).path).toContain(
    `after_assignment_id=${fixtureId(201)}`,
  );
  expect(reads.replacement(fixtureId(50), 7).path).toContain('after_rank=7');
  for (const spec of specifications)
    expect(isManagerRead(spec.path)).toBe(true);
});
test.each([
  '',
  '../operations',
  'bad',
  'https://evil.example',
  '00000000-0000-0000-0000-00000000000Z',
])('invalid identifiers never construct a read: %s', (id) => {
  expect(() => reads.route(id)).toThrow();
  expect(() => reads.capacity(id)).toThrow();
});
test.each([-1, 1.2, NaN, Infinity])(
  'candidate cursor must be a bounded integer: %s',
  (cursor) => {
    expect(() => reads.replacement(fixtureId(50), cursor)).toThrow();
  },
);
test('no collection completion, planner, mutation or other application read is allowlisted', () => {
  for (const path of [
    '/v2/manager/operations',
    '/v1/manager/fleets',
    '/v2/manager/routes/recover',
    '/v2/rider/route',
    '/v1/customer/collections',
    '/v1/auth/refresh',
    '//foreign.example/v1/manager/riders',
  ])
    expect(isManagerRead(path)).toBe(false);
});
test('malformed cursor and nullable data are rejected rather than guessed', () => {
  expect(() =>
    reads.backlog().parse({ items: [], next_request_id: 'not-a-uuid' }),
  ).toThrow();
  expect(() =>
    reads.fleet().parse({
      policy_version: 1,
      next_due_at: 'yesterday',
      cycles: [],
      exceptions: [],
    }),
  ).toThrow();
  expect(() =>
    reads.capacity(fixtureId(60)).parse({
      region_id: fixtureId(60),
      region_version: 1,
      resources: [{ vehicle_id: fixtureId(32), membership_version: 1 }],
      next_cursor: null,
    }),
  ).toThrow();
});
test('legacy replacement requester and reason may be null, while route pickup IDs are required', () => {
  const spec = reads.replacement(fixtureId(50));
  const raw = fixturePayload(spec.path, 'Normal workload') as Record<
    string,
    unknown
  >;
  expect(
    spec.parse({ ...raw, requested_by: null, reason: null }),
  ).toMatchObject({ requested_by: null, reason: null });
  const routeSpec = reads.route(fixtureId(30));
  const rawRoute = fixturePayload(routeSpec.path, 'Normal workload') as {
    tasks: Record<string, unknown>[];
  };
  expect(() =>
    routeSpec.parse({
      ...rawRoute,
      tasks: [{ ...rawRoute.tasks[0], pickup_execution_id: null }],
    }),
  ).toThrow();
});
