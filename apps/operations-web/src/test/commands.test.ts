import { commands, type Command } from '../api/commands';
import { reads } from '../api/reads';
import { createRuntime, unavailableRuntime } from '../runtime';
import { fixtureId as id, fixtureRuntime } from '../preview/fixtures';
import { access, deferred, harness, response } from './helpers';

const capabilities = { dispatch: true, fleet: true, orchestration: true };
const fail = () => commands.fail(id(2), 'RIDER_UNAVAILABLE', { [id(30)]: 3 });
const summary = {
  assignment_id: id(90),
  collection_group_id: id(10),
  rider_id: id(1),
  source: 'MANAGER_ASSIGNED',
  status: 'ACTIVE',
  assigned_at: '2026-10-24T04:00:00Z',
  started_at: null,
  completed_at: null,
};
const posts = (fetcher: ReturnType<typeof harness>['fetcher']) =>
  fetcher.mock.calls.filter(([, options]) => options?.method === 'POST');

test('V1 manual assignment sends only the rider; no invented command UUID', async () => {
  const { session, fetcher } = harness();
  await session.restore();
  fetcher.mockResolvedValueOnce(response(summary));
  expect(await session.execute(commands.assign(id(10), id(1)))).toEqual(
    summary,
  );
  expect(posts(fetcher)[0][1]).toMatchObject({
    method: 'POST',
    body: JSON.stringify({ rider_id: id(1) }),
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  });
  expect(posts(fetcher)[0][1]?.headers).toMatchObject({
    Authorization: 'Bearer private-access-one',
    'Content-Type': 'application/json',
  });
});
test('only branded allowlisted commands can reach transport', async () => {
  const { session, fetcher } = harness();
  await session.restore();
  const count = fetcher.mock.calls.length;
  await expect(
    session.execute({ ...fail(), path: 'https://evil.example' } as Command),
  ).rejects.toMatchObject({ kind: 'forbidden' });
  expect(fetcher).toHaveBeenCalledTimes(count);
  expect(() => commands.assign('../routes/activate', id(1))).toThrow();
  expect(() => commands.select(id(50), id(52), 0, 6, 2, {}, 'X')).toThrow();
  expect(() =>
    commands.fail(id(2), 'RIDER_UNAVAILABLE', { [id(30)]: -1 }),
  ).toThrow();
  expect(() => commands.resolve(id(50), 3, false)).toThrow();
  expect(() => commands.approve(id(40), 2, id(52), [], 'X')).toThrow();
});
test('all failure variants retain exact discriminators, distinct targets and 202 parsing', () => {
  const variants = [
    fail(),
    commands.approve(id(40), 2, id(52), [id(50)], 'MANAGER_DECISION'),
    commands.retry(id(80), 2, true),
    commands.resolve(id(50), 3, true),
  ];
  expect(
    variants.map((command) => JSON.parse(command.payload).operation),
  ).toEqual([
    'FAIL_RIDER',
    'APPROVE_RECOVERY',
    'RETRY_RECOVERY',
    'RESOLVE_FAILED_PICKUP',
  ]);
  for (const command of variants) {
    expect(command.expectedStatus).toBe(202);
    expect(command.path).toBe('/v2/manager/rider-failures');
    expect(command.parse({ resource_id: id(40) })).toEqual({
      resource_id: id(40),
    });
  }
  expect(JSON.parse(variants[0].payload).expected_route_versions).toEqual({
    [id(30)]: 3,
  });
  expect(JSON.parse(variants[2].payload).request_new_options).toBe(true);
});
test('uncertain reassignment survives navigation, double click and changed intent without minting a new business identity', async () => {
  const { session, fetcher } = harness();
  await session.restore();
  const runtime = createRuntime('verified-adapter', session, capabilities);
  const command = commands.reassign(id(33), id(1), id(95), id(40));
  const pending = deferred<Response>();
  fetcher.mockImplementationOnce(() => pending.promise);
  const key = runtime.commands.review(command, { booking: id(55) });
  const first = runtime.commands.submit(key, true);
  await Promise.resolve();
  await runtime.commands.submit(key, true);
  expect(runtime.commands.snapshot()[0].phase).toBe('submitting');
  pending.reject(new Error('lost response'));
  await first;
  expect(runtime.commands.snapshot()[0].phase).toBe('uncertain');
  runtime.commands.dismiss(key);
  expect(runtime.commands.snapshot()).toHaveLength(1);
  expect(
    runtime.commands.review(commands.reassign(id(33), id(1), id(96), id(40))),
  ).toBe(key);
  expect(() =>
    runtime.commands.review(commands.reassign(id(33), id(2))),
  ).toThrow(/already retained/);
  fetcher.mockResolvedValueOnce(response(summary));
  await runtime.commands.submit(key, true);
  expect(posts(fetcher)).toHaveLength(2);
  expect(posts(fetcher)[1][1]?.body).toBe(posts(fetcher)[0][1]?.body);
  expect(
    JSON.parse(String(posts(fetcher)[1][1]?.body)).client_reassignment_id,
  ).toBe(id(95));
  expect(runtime.commands.snapshot()[0].phase).toBe('completed');
  runtime.dispose();
});
test('no confirmation means no submission; completed record cannot be submitted again', async () => {
  const runtime = fixtureRuntime();
  await runtime.session.restore();
  const key = runtime.commands.review(fail());
  await runtime.commands.submit(key, false);
  expect(runtime.commands.snapshot()[0].phase).toBe('review');
  await runtime.commands.submit(key, true);
  expect(runtime.commands.snapshot()[0].phase).toBe('accepted');
  await runtime.commands.submit(key, true);
  expect(runtime.commands.snapshot()[0].phase).toBe('accepted');
  runtime.dispose();
});
test.each([200, 201, 204, 500, 503])(
  'failure HTTP %s cannot be called accepted or complete',
  async (status) => {
    const { session, fetcher } = harness();
    await session.restore();
    fetcher.mockResolvedValueOnce(response({ resource_id: id(40) }, status));
    await expect(session.execute(fail())).rejects.toMatchObject({
      kind: 'uncertain',
    });
  },
);
test('malformed acceptance is uncertain; raw errors are never reflected', async () => {
  const { session, fetcher } = harness();
  await session.restore();
  fetcher.mockResolvedValueOnce(response({ resource_id: 'not-an-id' }, 202));
  await expect(session.execute(fail())).rejects.toMatchObject({
    kind: 'uncertain',
  });
  fetcher.mockResolvedValueOnce(
    response({ detail: '<secret> diagnostic' }, 409),
  );
  await expect(session.execute(fail())).rejects.toMatchObject({
    kind: 'conflict',
    code: null,
  });
});
test('state conflicts are retained and cannot silently resubmit stale versions', async () => {
  const { session, fetcher } = harness();
  await session.restore();
  const runtime = createRuntime('verified-adapter', session, capabilities);
  fetcher.mockResolvedValueOnce(
    response({ detail: 'FAILURE_ROUTES_CHANGED' }, 409),
  );
  const key = runtime.commands.review(fail());
  await runtime.commands.submit(key, true);
  await runtime.commands.submit(key, true);
  expect(posts(fetcher)).toHaveLength(1);
  expect(runtime.commands.snapshot()[0]).toMatchObject({
    phase: 'conflict',
    code: 'FAILURE_ROUTES_CHANGED',
  });
  runtime.dispose();
});
test('retryable transaction conflict replays the identical command only on confirmation', async () => {
  const { session, fetcher } = harness();
  await session.restore();
  const runtime = createRuntime('verified-adapter', session, capabilities);
  fetcher.mockResolvedValueOnce(
    response({ detail: 'RETRYABLE_TRANSACTION_CONFLICT' }, 409),
  );
  const key = runtime.commands.review(fail());
  await runtime.commands.submit(key, true);
  fetcher.mockResolvedValueOnce(response({ resource_id: id(40) }, 202));
  await runtime.commands.submit(key, true);
  expect(posts(fetcher)[0][1]?.body).toBe(posts(fetcher)[1][1]?.body);
  runtime.dispose();
});
test('a read and mutation share one 401 refresh; exact mutation payload is retried once', async () => {
  const { session, fetcher, adapter } = harness();
  await session.restore();
  adapter.refresh.mockClear();
  adapter.refresh.mockResolvedValue(access('new-private-access'));
  fetcher.mockImplementation(async (input, options) => {
    const path = new URL(String(input)).pathname;
    if (path === '/v1/auth/me')
      return response({ user_id: id(99), roles: ['MANAGER'] });
    if (
      (options?.headers as Record<string, string>).Authorization ===
      'Bearer private-access-one'
    )
      return response({}, 401);
    return options?.method === 'POST'
      ? response({ resource_id: id(40) }, 202)
      : response([]);
  });
  const command = fail();
  await Promise.all([
    session.execute(command),
    session.read(reads.riders().path),
  ]);
  expect(adapter.refresh).toHaveBeenCalledTimes(1);
  expect(posts(fetcher)).toHaveLength(2);
  expect(posts(fetcher).map(([, options]) => options?.body)).toEqual([
    command.payload,
    command.payload,
  ]);
});
test.each([401, 403])(
  'HTTP %s after permitted refresh clears command ownership and never loops',
  async (status) => {
    const { session, fetcher, adapter } = harness();
    await session.restore();
    const runtime = createRuntime('verified-adapter', session, capabilities);
    adapter.refresh.mockClear();
    fetcher.mockImplementation(async (input) =>
      new URL(String(input)).pathname === '/v1/auth/me'
        ? response({ user_id: id(99), roles: ['MANAGER'] })
        : response({}, status),
    );
    const key = runtime.commands.review(fail());
    await runtime.commands.submit(key, true);
    expect(runtime.commands.snapshot()).toHaveLength(0);
    expect(adapter.refresh).toHaveBeenCalledTimes(status === 403 ? 0 : 1);
    expect(posts(fetcher)).toHaveLength(status === 403 ? 1 : 2);
    runtime.dispose();
  },
);
test('logout aborts a pending command, clears journal/cache and discards a late 202', async () => {
  const { session, fetcher } = harness();
  await session.restore();
  const runtime = createRuntime('verified-adapter', session, capabilities);
  const late = deferred<Response>();
  let signal: AbortSignal | undefined;
  fetcher.mockImplementationOnce(async (_input, options) => {
    signal = options?.signal ?? undefined;
    return late.promise;
  });
  const key = runtime.commands.review(fail());
  const pending = runtime.commands.submit(key, true);
  await Promise.resolve();
  await Promise.resolve();
  await session.logout();
  late.resolve(response({ resource_id: id(40) }, 202));
  await pending;
  expect(signal?.aborted).toBe(true);
  expect(runtime.commands.snapshot()).toHaveLength(0);
  expect(runtime.queries.getQueryCache().getAll()).toHaveLength(0);
  runtime.dispose();
});
test('changed principal during mutation refresh cannot reuse an old command', async () => {
  const { session, fetcher, adapter } = harness();
  await session.restore();
  const runtime = createRuntime('verified-adapter', session, capabilities);
  fetcher.mockResolvedValueOnce(response({}, 401));
  adapter.refresh.mockResolvedValueOnce(access('different-owner', id(98)));
  const key = runtime.commands.review(fail());
  await runtime.commands.submit(key, true);
  expect(posts(fetcher)).toHaveLength(1);
  expect(runtime.commands.snapshot()).toHaveLength(0);
  runtime.dispose();
});
test('finite network/body deadline retains an uncertain identity even when fetch ignores abort', async () => {
  const { session, fetcher } = harness(['MANAGER'], 30);
  await session.restore();
  const runtime = createRuntime('verified-adapter', session, capabilities);
  fetcher.mockImplementationOnce(
    async () =>
      ({
        status: 202,
        ok: true,
        json: () => new Promise(() => {}),
      }) as Response,
  );
  const key = runtime.commands.review(fail());
  await runtime.commands.submit(key, true);
  expect(runtime.commands.snapshot()[0].phase).toBe('uncertain');
  runtime.dispose();
});
test('feature-disabled and production-unavailable runtimes cannot prepare writes', async () => {
  const { session, fetcher } = harness();
  await session.restore();
  const runtime = createRuntime('verified-adapter', session, {
    ...capabilities,
    orchestration: false,
  });
  expect(() => runtime.commands.review(fail())).toThrow(/unavailable/);
  expect(posts(fetcher)).toHaveLength(0);
  runtime.dispose();
  const unavailable = unavailableRuntime(
    'https://gateway.example',
    capabilities,
  );
  expect(() =>
    unavailable.commands.review(commands.assign(id(10), id(1))),
  ).toThrow();
  unavailable.dispose();
});
test('fixture command simulation performs no global network requests and preserves 202 pending semantics', async () => {
  const runtime = fixtureRuntime();
  await runtime.session.restore();
  const key = runtime.commands.review(fail());
  await runtime.commands.submit(key, true);
  const result = runtime.commands.snapshot()[0];
  expect(result.phase).toBe('accepted');
  expect(result.result).toEqual({ resource_id: id(40) });
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toMatch(
    /FIXTURE_ONLY_NEVER_A_REAL_CREDENTIAL/,
  );
  runtime.dispose();
});

test('the local retry window expires without deleting an uncertain identity or permitting a changed decision', async () => {
  const { session, fetcher } = harness();
  await session.restore();
  const runtime = createRuntime('verified-adapter', session, capabilities);
  fetcher.mockRejectedValueOnce(new Error('response lost'));
  const key = runtime.commands.review(commands.reassign(id(33), id(1)));
  await runtime.commands.submit(key, true);
  const clock = jest
    .spyOn(Date, 'now')
    .mockReturnValue(runtime.commands.snapshot()[0].createdAt + 16 * 60000);
  try {
    await runtime.commands.submit(key, true);
    expect(posts(fetcher)).toHaveLength(1);
    expect(runtime.commands.snapshot()[0]).toMatchObject({
      phase: 'uncertain',
      message: expect.stringContaining('window has ended'),
    });
    expect(() =>
      runtime.commands.review(commands.reassign(id(33), id(3))),
    ).toThrow(/already retained/);
  } finally {
    clock.mockRestore();
    runtime.dispose();
  }
});
