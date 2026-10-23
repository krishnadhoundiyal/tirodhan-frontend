import { ApiError } from '../api/errors';
import { createFixtureRepository } from '../features/fixtures';
import {
  createFieldFixtures,
  fixturePoint,
} from '../features/evidence/fixtures';
import {
  createEvidenceService,
  type FieldReads,
} from '../features/evidence/service';
import { createEvidenceStore, readState } from '../features/evidence/store';
import { routeContext, type Command } from '../features/evidence/contracts';

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
};
async function setup(mode: 'V1' | 'V2' | 'FAILURE' = 'V1') {
  let raw: string | null = null,
    current = true,
    count = 0;
  const base = createFixtureRepository();
  base.setScenario(mode === 'V1' ? 'execution-v1' : 'execution-v2');
  const assignment = (await base.repository.assignment()).assignment!;
  assignment.pickups[0]!.status = mode === 'FAILURE' ? 'ASSIGNED' : 'COLLECTED';
  const route = await base.repository.route();
  if (route) {
    route.tasks[0]!.state = mode === 'FAILURE' ? 'STARTED' : 'COMPLETED';
    route.tasks[1]!.state = 'STARTED';
  }
  const reads: FieldReads = { assignment, route };
  const f = createFieldFixtures(() => {});
  const api = {
    points: jest.fn(f.api.points),
    send: jest.fn(f.api.send),
    register: jest.fn(f.api.register),
    authorize: jest.fn(f.api.authorize),
    finalize: jest.fn(f.api.finalize),
  };
  const vault = {
    ...f.vault,
    remove: jest.fn(f.vault.remove),
    sweep: jest.fn(f.vault.sweep),
  };
  const upload = jest.fn(f.upload);
  const storage = {
    get: jest.fn(async () => raw),
    set: jest.fn(async (s: string) => {
      raw = s;
    }),
    remove: jest.fn(async () => {
      raw = null;
    }),
  };
  const store = createEvidenceStore(storage);
  const scope = {
    owner: 'rider-1',
    current: () => current,
    uuid: () => `uuid-${++count}`,
    fresh: jest.fn(async () => reads),
    refresh: jest.fn(async () => {}),
    executionPending: jest.fn(async () => false),
  };
  const restart = () =>
    createEvidenceService(
      api,
      createEvidenceStore(storage),
      vault,
      upload,
      scope,
    );
  const service = restart();
  await service.load();
  await service.observe(reads);
  const capturedAt = new Date().toISOString();
  const local = await vault.seal('fixture', 'PHOTO', capturedAt, () => {});
  const capture: Command = {
    kind: 'CAPTURE',
    id: 'capture-command',
    target: { kind: 'PICKUP', id: 'demo-pickup' },
    capturedAt,
  };
  const handover: Command = {
    kind: 'HANDOVER',
    id: 'handover-command',
    pickupId: 'demo-pickup',
    pointId: fixturePoint.receiving_point_id,
    location: { latitude: 12, longitude: 77 },
  };
  const context = route ? routeContext(route)! : null;
  const discharge: Command | null = context && {
    kind: 'DISCHARGE',
    id: 'discharge-command',
    context,
    pointId: fixturePoint.receiving_point_id,
    pickupScan: 'demo-pickup',
    pointScan: fixturePoint.official_identifier!,
    capturedAt,
    captureClientId: 'discharge-capture',
    location: { latitude: 12, longitude: 77 },
  };
  return {
    service,
    api,
    vault,
    upload,
    storage,
    store,
    scope,
    reads,
    local,
    capture,
    handover,
    discharge,
    restart,
    raw: () => raw!,
    switchOwner: () => {
      current = false;
    },
  };
}

test('pickup evidence is durable before HTTP, finalized by the server and contains no storage authorization', async () => {
  const h = await setup();
  const send = h.api.send.getMockImplementation()!;
  h.api.send.mockImplementation(async (command) => {
    expect(JSON.parse(h.raw()).operation.command).toEqual(command);
    return send(command);
  });
  const result = await h.service.begin(h.capture, h.local);
  expect(result.operation?.stage).toBe('FINALIZED');
  expect(result.operation?.local).toBeNull();
  expect(result.work[0]?.pickupCapture).toBe(true);
  expect(result.work[0]?.handover).toBeNull();
  expect(h.api.register).toHaveBeenCalledTimes(1);
  expect(h.upload).toHaveBeenCalledTimes(1);
  expect(h.api.finalize).toHaveBeenCalledTimes(1);
  expect(h.raw()).not.toMatch(
    /fixture-only|authorization|COMPLETED|access_token|refresh_token/,
  );
  expect(h.scope.refresh).toHaveBeenCalled();
});

test('V1 handover retains historical collection after assignment disappears and captures its returned event', async () => {
  const h = await setup();
  h.reads.assignment = null;
  const result = await h.service.begin(h.handover, h.local);
  expect(result.operation?.handover?.status).toBe('VALIDATED');
  expect(h.api.send.mock.calls.map(([c]) => c.kind)).toEqual([
    'HANDOVER',
    'CAPTURE',
  ]);
  expect(h.api.send.mock.calls[1]![0]).toMatchObject({
    target: { kind: 'HANDOVER', id: result.operation?.handover?.id },
  });
  await h.service.review();
  const second = await h.vault.seal(
    'fixture',
    'PHOTO',
    h.local.capturedAt,
    () => {},
  );
  await expect(
    h.service.begin({ ...h.handover, id: 'second-handover' }, second),
  ).rejects.toMatchObject({ status: 409 });
  expect(h.api.send).toHaveBeenCalledTimes(2);
});

test('V2 DISCHARGE never posts V1 handover or duplicates the server capture when its reference is absent', async () => {
  const h = await setup('V2');
  const result = await h.service.begin(h.discharge!, h.local);
  expect(result.operation).toMatchObject({
    stage: 'GAP',
    captureId: null,
    media: null,
    handover: { status: 'VALIDATED' },
  });
  expect(h.api.send.mock.calls.map(([c]) => c.kind)).toEqual(['DISCHARGE']);
  expect(h.api.register).not.toHaveBeenCalled();
  expect(h.upload).not.toHaveBeenCalled();
  expect(h.raw()).not.toContain('COMPLETED');
  await h.service.review();
  expect((await h.service.load()).work[0]?.handover?.status).toBe('VALIDATED');
});

test.each([true, false])(
  'V2 unsuccessful pickup uses only the returned capture ID (provided=%s)',
  async (provided) => {
    const h = await setup('FAILURE');
    h.api.send.mockResolvedValue({
      resourceId: 'attempt',
      captureId: provided ? 'server-capture' : null,
    });
    const command: Command = {
      kind: 'UNSUCCESSFUL',
      id: 'failed-pickup',
      context: routeContext(h.reads.route!)!,
      reason: 'ACCESS_BLOCKED',
      captureClientId: 'failure-capture',
      capturedAt: h.local.capturedAt,
    };
    const result = await h.service.begin(command, h.local);
    expect(h.api.send).toHaveBeenCalledTimes(1);
    expect(result.operation?.stage).toBe(provided ? 'FINALIZED' : 'GAP');
    if (provided)
      expect(h.api.register.mock.calls[0]?.[1]).toBe('server-capture');
    else expect(h.api.register).not.toHaveBeenCalled();
  },
);

test.each([
  'point',
  'revision',
  'task',
  'scan',
  'identifier',
  'assignment',
  'order',
] as const)('V2 fails closed on stale or unsupported %s', async (issue) => {
  const h = await setup('V2');
  const c = h.discharge!;
  if (c.kind !== 'DISCHARGE') throw new Error();
  if (issue === 'point') c.pointId = 'unauthorized';
  if (issue === 'revision') c.context.revisionId = 'old';
  if (issue === 'task') c.context.taskId = 'old';
  if (issue === 'scan') c.pointScan = '';
  if (issue === 'identifier')
    h.api.points.mockResolvedValue([
      { ...fixturePoint, official_identifier: null },
    ]);
  if (issue === 'assignment') h.reads.assignment!.assignment_id = 'replacement';
  if (issue === 'order') h.reads.route!.tasks[0]!.state = 'PENDING';
  await expect(h.service.begin(c, h.local)).rejects.toBeInstanceOf(ApiError);
  expect(h.api.send).not.toHaveBeenCalled();
});

test('vehicle-bound evidence cannot be delivered via the V1 handover path', async () => {
  const h = await setup('V2');
  await expect(h.service.begin(h.handover, h.local)).rejects.toMatchObject({
    status: 409,
  });
  expect(h.api.send).not.toHaveBeenCalled();
});

test.each(['PICKUP', 'HANDOVER'] as const)(
  'unattributed %s evidence is rejected before capture registration',
  async (kind) => {
    const h = await setup();
    await expect(
      h.service.begin(
        {
          ...h.capture,
          kind: 'CAPTURE',
          target: { kind, id: 'other-riders-target' },
          capturedAt: h.local.capturedAt,
        },
        h.local,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(h.api.send).not.toHaveBeenCalled();
  },
);

test('invalid V1 destination is rejected before recording a handover', async () => {
  const h = await setup();
  await expect(
    h.service.begin(
      {
        ...h.handover,
        kind: 'HANDOVER',
        pickupId: 'demo-pickup',
        pointId: 'foreign',
        location: { latitude: 12, longitude: 77 },
      },
      h.local,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(h.api.send).not.toHaveBeenCalled();
});

test('server geofence rejection remains rejected even when its evidence finalizes', async () => {
  const h = await setup();
  const send = h.api.send.getMockImplementation()!;
  h.api.send.mockImplementation(async (c) =>
    c.kind === 'HANDOVER'
      ? {
          resourceId: 'rejected-event',
          handover: {
            id: 'rejected-event',
            status: 'REJECTED',
            code: 'OUTSIDE_ALLOWED_RADIUS',
          },
        }
      : send(c),
  );
  const state = await h.service.begin(h.handover, h.local);
  expect(state.operation?.stage).toBe('FINALIZED');
  expect(state.work[0]?.handover?.status).toBe('REJECTED');
  expect(h.raw()).not.toContain('COMPLETED');
});

test('storage failure prevents external side effects', async () => {
  const h = await setup();
  h.storage.set.mockRejectedValue(new Error('Keychain locked'));
  await expect(h.service.begin(h.capture, h.local)).rejects.toMatchObject({
    kind: 'configuration',
  });
  expect(h.api.send).not.toHaveBeenCalled();
  expect(h.vault.remove).toHaveBeenCalledWith(h.local.id);
});

test('ambiguous secure-store commit keeps the sealed original and restart replays before any new capture', async () => {
  const h = await setup(),
    write = h.storage.set.getMockImplementation()!;
  let loseAcknowledgement = true;
  h.storage.set.mockImplementation(async (value) => {
    await write(value);
    if (
      loseAcknowledgement &&
      JSON.parse(value).operation?.stage === 'PREPARED'
    ) {
      loseAcknowledgement = false;
      throw new Error('commit acknowledgement lost');
    }
  });
  await expect(h.service.begin(h.capture, h.local)).rejects.toMatchObject({
    kind: 'configuration',
  });
  expect(h.api.send).not.toHaveBeenCalled();
  expect(h.vault.remove).not.toHaveBeenCalled();
  expect((await h.restart().retry()).operation?.stage).toBe('FINALIZED');
  expect(h.api.send).toHaveBeenCalledTimes(1);
});

test('registration replay already finalized on the server never overwrites the original object', async () => {
  const h = await setup(),
    register = h.api.register.getMockImplementation()!;
  h.api.register.mockImplementation(async (...args) => ({
    ...(await register(...args)),
    status: 'FINALIZED',
    size: 8,
  }));
  expect((await h.service.begin(h.capture, h.local)).operation?.stage).toBe(
    'FINALIZED',
  );
  expect(h.api.authorize).not.toHaveBeenCalled();
  expect(h.upload).not.toHaveBeenCalled();
  expect(h.api.finalize).not.toHaveBeenCalled();
});

test('shift/position guard rejection is retained without a fallback V1 mutation', async () => {
  const h = await setup('V2');
  h.api.send.mockRejectedValue(
    new ApiError(409, 'http', 'FRESH_POSITION_REQUIRED'),
  );
  await expect(h.service.begin(h.discharge!, h.local)).rejects.toMatchObject({
    code: 'FRESH_POSITION_REQUIRED',
  });
  expect((await h.service.load()).operation?.stage).toBe('REJECTED');
  expect(h.api.send.mock.calls.map(([c]) => c.kind)).toEqual(['DISCHARGE']);
  expect(h.api.register).not.toHaveBeenCalled();
});

test('identical double tap joins one flight; another command cannot consume its receipt', async () => {
  const h = await setup(),
    gate = deferred<Awaited<ReturnType<typeof h.api.send>>>();
  h.api.send.mockReturnValue(gate.promise);
  const first = h.service.begin(h.capture, h.local),
    same = h.service.begin(h.capture, h.local);
  expect(same).toBe(first);
  await expect(h.service.begin(h.handover, h.local)).rejects.toMatchObject({
    status: 409,
  });
  gate.resolve({ resourceId: 'capture' });
  await first;
  expect(h.api.send).toHaveBeenCalledTimes(1);
});

test('lost handover response replays the original command and exact coordinates after restart', async () => {
  const h = await setup(),
    send = h.api.send.getMockImplementation()!;
  h.api.send.mockImplementationOnce(async (c) => {
    await send(c);
    throw new ApiError(0, 'network');
  });
  await expect(h.service.begin(h.handover, h.local)).rejects.toMatchObject({
    kind: 'network',
  });
  expect((await h.service.load()).operation?.stage).toBe('PREPARED');
  h.reads.assignment = null;
  const state = await h.restart().retry();
  expect(state.operation?.stage).toBe('FINALIZED');
  expect(h.api.send.mock.calls[0]).toEqual(h.api.send.mock.calls[1]);
});

test('upload succeeded and finalize response was lost: restart finalizes the same asset without reupload', async () => {
  const h = await setup(),
    finalize = h.api.finalize.getMockImplementation()!;
  h.api.finalize.mockImplementationOnce(async (id) => {
    await finalize(id);
    throw new ApiError(0, 'network');
  });
  await expect(h.service.begin(h.capture, h.local)).rejects.toMatchObject({
    kind: 'network',
  });
  expect((await h.service.load()).operation?.stage).toBe('FINALIZE');
  expect((await h.restart().retry()).operation?.stage).toBe('FINALIZED');
  expect(h.upload).toHaveBeenCalledTimes(1);
  expect(h.api.register).toHaveBeenCalledTimes(1);
  expect(h.api.finalize.mock.calls[0]).toEqual(h.api.finalize.mock.calls[1]);
});

test('partial upload retries original bytes and registration only after server finalization rejects missing object', async () => {
  const h = await setup();
  h.upload.mockRejectedValueOnce(new ApiError(0, 'network'));
  await expect(h.service.begin(h.capture, h.local)).rejects.toMatchObject({
    kind: 'network',
  });
  expect((await h.service.load()).operation?.stage).toBe('UPLOADING');
  expect((await h.restart().retry()).operation?.stage).toBe('FINALIZED');
  expect(h.api.register.mock.calls[0]).toEqual(h.api.register.mock.calls[1]);
  expect(h.upload.mock.calls[0]?.[2]).toEqual(h.upload.mock.calls[1]?.[2]);
  expect(h.api.authorize).toHaveBeenCalledTimes(2);
  expect(h.api.send).toHaveBeenCalledTimes(1);
});

test.each([false, true])(
  'expired authorization reissues at most once (persistent expiry=%s)',
  async (persistent) => {
    const h = await setup();
    if (persistent) h.upload.mockRejectedValue(new ApiError(403));
    else h.upload.mockRejectedValueOnce(new ApiError(403));
    const result = h.service.begin(h.capture, h.local);
    if (persistent) await expect(result).rejects.toMatchObject({ status: 403 });
    else expect((await result).operation?.stage).toBe('FINALIZED');
    expect(h.api.authorize).toHaveBeenCalledTimes(2);
    expect(h.upload).toHaveBeenCalledTimes(2);
  },
);

test('server evidence rejection is durable and cannot be mistaken for capture success', async () => {
  const h = await setup();
  h.api.send.mockRejectedValue(new ApiError(422));
  await expect(h.service.begin(h.capture, h.local)).rejects.toMatchObject({
    status: 422,
  });
  expect((await h.service.load()).operation?.stage).toBe('REJECTED');
  expect(h.api.register).not.toHaveBeenCalled();
  await h.service.review();
  expect((await h.service.load()).operation).toBeNull();
});

test('auth expiry retains the sealed attempt; new account cannot publish its late callback', async () => {
  const h = await setup();
  h.api.send.mockRejectedValueOnce(new ApiError(401));
  await expect(h.service.begin(h.capture, h.local)).rejects.toMatchObject({
    status: 401,
  });
  expect((await h.service.load()).operation?.stage).toBe('PREPARED');
  const gate = deferred<Awaited<ReturnType<typeof h.api.send>>>();
  h.api.send.mockReturnValueOnce(gate.promise);
  const retry = h.service.retry();
  await new Promise((resolve) => setTimeout(resolve, 0));
  h.switchOwner();
  gate.resolve({ resourceId: 'late-capture' });
  await expect(retry).rejects.toMatchObject({ kind: 'cancelled' });
  expect(JSON.parse(h.raw()).operation.captureId).toBeNull();
  expect(h.api.register).not.toHaveBeenCalled();
});

test('backgrounding stops the next external stage and explicit retry resumes', async () => {
  const h = await setup(),
    send = h.api.send.getMockImplementation()!;
  h.api.send.mockImplementationOnce(async (c) => {
    const receipt = await send(c);
    h.service.suspend();
    return receipt;
  });
  await expect(h.service.begin(h.capture, h.local)).rejects.toMatchObject({
    kind: 'cancelled',
  });
  expect(h.api.register).not.toHaveBeenCalled();
  h.service.resume();
  expect((await h.service.retry()).operation?.stage).toBe('FINALIZED');
  expect(h.api.send).toHaveBeenCalledTimes(1);
});

test('expired bytes are erased and a pending upload can still reconcile finalized server metadata', async () => {
  const h = await setup(),
    finalize = h.api.finalize.getMockImplementation()!;
  h.api.finalize.mockImplementationOnce(async (id) => {
    await finalize(id);
    throw new ApiError(0, 'network');
  });
  await expect(h.service.begin(h.capture, h.local)).rejects.toBeInstanceOf(
    ApiError,
  );
  await h.store.change(
    'rider-1',
    () => {},
    (s) => ({
      ...s,
      operation: {
        ...s.operation!,
        local: { ...s.operation!.local!, createdAt: Date.now() - 86400001 },
      },
    }),
  );
  const restarted = h.restart();
  expect((await restarted.load()).operation?.local).toBeNull();
  expect((await restarted.retry()).operation?.stage).toBe('FINALIZED');
  expect(h.upload).toHaveBeenCalledTimes(1);
});

test('new owner deletes the prior private ledger and corrupt persisted state fails closed', async () => {
  const h = await setup();
  expect((await h.store.load('rider-2', () => {})).work).toEqual([]);
  expect(h.storage.remove).toHaveBeenCalled();
  await h.storage.set('{broken');
  await expect(h.store.load('rider-2', () => {})).rejects.toMatchObject({
    kind: 'configuration',
  });
});

test('tampered terminal state, mismatched media owner or embedded SAS cannot be loaded', async () => {
  const h = await setup();
  await h.service.begin(h.capture, h.local);
  const state = JSON.parse(h.raw());
  expect(() => readState({ ...state, authorization: 'SAS' })).toThrow();
  expect(() =>
    readState({
      ...state,
      operation: {
        ...state.operation,
        media: { ...state.operation.media, status: 'PENDING_UPLOAD' },
      },
    }),
  ).toThrow();
  expect(() =>
    readState({
      ...state,
      operation: {
        ...state.operation,
        media: { ...state.operation.media, clientId: 'different' },
      },
    }),
  ).toThrow();
});
