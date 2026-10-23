import { PaymentRecoveryStore } from '../features/collection/paymentRecovery';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
function storage() {
  let raw: string | null = null;
  return {
    get: jest.fn(async () => raw),
    set: jest.fn(async (value: string) => {
      raw = value;
    }),
    remove: jest.fn(async () => {
      raw = null;
    }),
  };
}
test('restart and concurrent prepares retain one durable command for a booking', async () => {
  const port = storage(),
    store = new PaymentRecoveryStore(port),
    uuid = jest.fn(() => first);
  const [a, b] = await Promise.all([
    store.prepare('owner', 'request', uuid, () => {}),
    store.prepare('owner', 'request', uuid, () => {}),
  ]);
  expect(a).toEqual(b);
  expect(uuid).toHaveBeenCalledTimes(1);
  await store.bind('owner', a, 'attempt', 'order_original', () => {});
  const restored = new PaymentRecoveryStore(port);
  expect(
    await restored.prepare(
      'owner',
      'request',
      () => second,
      () => {},
    ),
  ).toMatchObject({
    commandKey: first,
    attemptId: 'attempt',
    orderId: 'order_original',
  });
});
test('another owner cannot read or reuse a previous customer command', async () => {
  const store = new PaymentRecoveryStore(storage());
  await store.prepare(
    'A',
    'request',
    () => first,
    () => {},
  );
  expect(
    await store.prepare(
      'B',
      'request',
      () => second,
      () => {},
    ),
  ).toMatchObject({ commandKey: second, attemptId: null });
});
test('stale account cannot write after an awaited storage read; logout clears queued writes', async () => {
  const port = storage(),
    store = new PaymentRecoveryStore(port);
  let active = true,
    complete!: (v: string | null) => void;
  port.get.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const operation = store.prepare(
    'A',
    'request',
    () => first,
    () => {
      if (!active) throw new Error('stale');
    },
  );
  await Promise.resolve();
  await Promise.resolve();
  active = false;
  const cleared = store.clear();
  complete(null);
  await expect(operation).rejects.toThrow('stale');
  await cleared;
  expect(port.set).not.toHaveBeenCalled();
  expect(port.remove).toHaveBeenCalledTimes(1);
});
test('corrupt secure recovery is not silently replaced with a fresh key', async () => {
  const port = storage();
  await port.set('{broken');
  const store = new PaymentRecoveryStore(port);
  await expect(
    store.prepare(
      'A',
      'request',
      () => first,
      () => {},
    ),
  ).rejects.toMatchObject({ kind: 'protocol' });
  expect(port.set).toHaveBeenCalledTimes(1);
});

test('only authoritative success cleanup removes a resolved command while other bookings remain recoverable', async () => {
  const port = storage(),
    store = new PaymentRecoveryStore(port);
  await store.prepare(
    'owner',
    'A',
    () => first,
    () => {},
  );
  await store.prepare(
    'owner',
    'B',
    () => second,
    () => {},
  );
  await store.resolve('owner', 'A', () => {});
  expect(
    JSON.parse((await port.get())!).commands.map(
      (c: { requestId: string }) => c.requestId,
    ),
  ).toEqual(['B']);
  await store.resolve('owner', 'B', () => {});
  expect(await port.get()).toBeNull();
});
