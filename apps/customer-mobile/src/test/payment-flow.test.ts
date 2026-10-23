import type {
  CheckoutParameters,
  CollectionDetail,
  PaymentRead,
} from '../api/customer-contracts';
import type { PaymentAttempt } from '../api/contracts';
import {
  paymentFlow,
  type PaymentScope,
} from '../features/collection/paymentFlow';
import { PaymentRecoveryStore } from '../features/collection/paymentRecovery';
import { ApiError } from '../api/errors';

const commandKey = '11111111-1111-4111-8111-111111111111';
const pending = (): PaymentRead => ({
  request_id: 'request',
  payment_id: 'payment',
  amount_minor: 35000,
  currency: 'INR',
  status: 'PENDING',
  retry_allowed: true,
  action: 'START',
  action_reason: 'NEW_PAYMENT',
  verification_pending: false,
  checkout_ready_until: null,
  expires_at: new Date(Date.now() + 300000).toISOString(),
  succeeded_at: null,
  current_attempt: null,
});
const attempt = (): PaymentAttempt => ({
  payment_attempt_id: 'attempt',
  status: 'PENDING',
  provider: 'RAZORPAY',
  provider_order_id: 'order_original',
  provider_payment_id: null,
  failure_code: null,
  action: 'START',
  action_reason: 'CHECKOUT_READY',
  checkout_ready_until: new Date(Date.now() + 60000).toISOString(),
});
const checkout = (p: PaymentRead): CheckoutParameters => ({
  request_id: 'request',
  payment_attempt_id: 'attempt',
  provider: 'RAZORPAY',
  public_key_id: 'rzp_test_example',
  provider_order_id: 'order_original',
  merchant_display_name: 'Tirodhan',
  amount_minor: 35000,
  currency: 'INR',
  expires_at: p.expires_at!,
  checkout_ready_until: new Date(Date.now() + 60000).toISOString(),
});
function setup() {
  let current = true,
    raw: string | null = null,
    projection = pending(),
    status = 'PENDING_PAYMENT';
  const storage = {
    get: jest.fn(async () => raw),
    set: jest.fn(async (value: string) => {
      raw = value;
    }),
    remove: jest.fn(async () => {
      raw = null;
    }),
  };
  const recovery = new PaymentRecoveryStore(storage);
  const execute = jest.fn(async () => attempt());
  const repository = {
    payment: jest.fn(async () => projection),
    // Only the owned detail fields consumed by the payment unit are needed here.
    detail: jest.fn(
      async () =>
        ({
          request_id: 'request',
          status,
          quote: { amount_minor: 35000, currency: 'INR' },
          payment: projection,
        }) as CollectionDetail,
    ),
    paymentAttempt: jest.fn((_id: string, _key?: string) => ({ execute })),
    checkout: jest.fn(async () => checkout(projection)),
  };
  const native = {
    launch: jest.fn(async (_p: CheckoutParameters, authorize: () => void) => {
      authorize();
    }),
  };
  const scope: PaymentScope = {
    owner: 'owner',
    isCurrent: () => current,
    recovery,
    newId: jest.fn(() => commandKey),
    random: () => 0.5,
    verificationWindowMs: 180000,
    callbackTimeoutMs: 1000,
  };
  const flow = paymentFlow('request', repository, native, scope);
  flows.push(flow);
  return {
    repository,
    execute,
    native,
    scope,
    flow,
    storage,
    recovery,
    raw: () => raw,
    setPayment: (p: Partial<PaymentRead>) => {
      projection = { ...projection, ...p };
    },
    setStatus: (s: string) => {
      status = s;
    },
    setCurrent: (c: boolean) => {
      current = c;
    },
  };
}
const flows: ReturnType<typeof paymentFlow>[] = [];
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-23T02:00:00Z'));
});
afterEach(() => {
  flows.splice(0).forEach((f) => f.dispose());
  jest.useRealTimers();
});
async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await Promise.resolve();
  expect(check()).toBe(true);
}
test('missing native runtime blocks before preparing or writing a command', async () => {
  const s = setup();
  await expect(
    paymentFlow('request', s.repository, null, s.scope).start(),
  ).rejects.toMatchObject({ kind: 'backendPending' });
  expect(s.repository.paymentAttempt).not.toHaveBeenCalled();
  expect(s.storage.set).not.toHaveBeenCalled();
});
test.each(['START', 'RESUME'] as const)(
  '%s fetches a fresh handoff and uses original Order; callback cannot confirm payment',
  async (action) => {
    const s = setup();
    s.execute.mockResolvedValue({ ...attempt(), action });
    await expect(s.flow.start()).resolves.toMatchObject({ status: 'PENDING' });
    expect(s.repository.checkout).toHaveBeenCalledWith('attempt');
    expect(s.native.launch.mock.calls[0]![0].provider_order_id).toBe(
      'order_original',
    );
    expect(s.storage.set.mock.invocationCallOrder[0]).toBeLessThan(
      s.execute.mock.invocationCallOrder[0]!,
    );
    expect(s.repository.detail).toHaveBeenCalledTimes(2);
  },
);
test.each(['WAIT', 'UNAVAILABLE'] as const)(
  '%s never fetches checkout or launches the SDK, and refreshes both reads',
  async (action) => {
    const s = setup();
    s.execute.mockResolvedValue({
      ...attempt(),
      action,
      action_reason:
        action === 'WAIT' ? 'RECONCILIATION_REQUIRED' : 'ACCOUNT_MISMATCH',
      checkout_ready_until: null,
    });
    await s.flow.start();
    expect(s.repository.checkout).not.toHaveBeenCalled();
    expect(s.native.launch).not.toHaveBeenCalled();
    expect(s.repository.payment).toHaveBeenCalledTimes(2);
    expect(s.repository.detail).toHaveBeenCalledTimes(2);
  },
);
test('WAIT status permits an explicit preparation inquiry with retained command, never automatic SDK reopening', async () => {
  const s = setup();
  s.setPayment({
    status: 'CONFIRMING',
    retry_allowed: false,
    action: 'WAIT',
    action_reason: 'VERIFICATION_REQUIRED',
    verification_pending: true,
  });
  await s.flow.start();
  expect(s.native.launch).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(30000);
  expect(s.execute).toHaveBeenCalledTimes(1);
  expect(s.native.launch).toHaveBeenCalledTimes(1);
});
test('unknown preparation action/reason fails closed', async () => {
  const s = setup();
  s.execute.mockResolvedValue({ ...attempt(), action: 'FUTURE' as 'START' });
  await s.flow.start();
  expect(s.native.launch).not.toHaveBeenCalled();
  expect(s.repository.checkout).not.toHaveBeenCalled();
});
test.each([
  { request_id: 'other' },
  { payment_attempt_id: 'other' },
  { provider_order_id: 'order_other' },
  { provider: 'OTHER' },
  { public_key_id: '' },
  { merchant_display_name: '' },
  { amount_minor: 1 },
  { currency: 'USD' },
  { checkout_ready_until: '2000-01-01T00:00:00Z' },
  { expires_at: '2000-01-01T00:00:00Z' },
  { amount_minor: Number.MAX_SAFE_INTEGER + 1 },
])('rejects stale/mismatched/incomplete checkout %j', async (patch) => {
  const s = setup();
  s.repository.checkout.mockResolvedValue({
    ...checkout(pending()),
    ...patch,
  } as CheckoutParameters);
  await expect(s.flow.start()).rejects.toBeInstanceOf(ApiError);
  expect(s.native.launch).not.toHaveBeenCalled();
  expect(s.repository.detail).toHaveBeenCalledTimes(2);
});
test('duplicate taps share one flight and one preparation/launch', async () => {
  const s = setup();
  const a = s.flow.start(),
    b = s.flow.start();
  expect(a).toBe(b);
  await a;
  expect(s.execute).toHaveBeenCalledTimes(1);
  expect(s.native.launch).toHaveBeenCalledTimes(1);
});
test('network loss during preparation replays exact key; failed instrument and dismissal reuse original Order', async () => {
  const s = setup();
  s.execute.mockRejectedValueOnce(new ApiError(0, 'network'));
  await expect(s.flow.start()).rejects.toMatchObject({ kind: 'network' });
  s.native.launch.mockRejectedValueOnce({
    description: 'SECRET PROVIDER PAYLOAD',
  });
  await s.flow.start();
  s.execute.mockResolvedValue({ ...attempt(), action: 'RESUME' });
  await s.flow.start();
  expect(s.repository.paymentAttempt.mock.calls.map((c) => c[1])).toEqual([
    commandKey,
    commandKey,
    commandKey,
  ]);
  expect(s.native.launch.mock.calls.map((c) => c[0].provider_order_id)).toEqual(
    ['order_original', 'order_original'],
  );
  expect(JSON.stringify(s.flow.getSnapshot())).not.toContain(
    'SECRET PROVIDER PAYLOAD',
  );
});
test('secure persistence failure prevents any preparation HTTP call', async () => {
  const s = setup();
  s.storage.set.mockRejectedValueOnce(new Error('Keychain locked'));
  await expect(s.flow.start()).rejects.toBeInstanceOf(ApiError);
  expect(s.execute).not.toHaveBeenCalled();
});
test('restart recovers exact command and original Order; status refresh never opens checkout', async () => {
  const s = setup();
  await s.flow.start();
  s.flow.dispose();
  const restored = paymentFlow('request', s.repository, s.native, {
    ...s.scope,
    recovery: new PaymentRecoveryStore(s.storage),
  });
  flows.push(restored);
  await restored.refresh();
  expect(s.native.launch).toHaveBeenCalledTimes(1);
  await restored.start();
  expect(s.scope.newId).toHaveBeenCalledTimes(1);
  expect(s.repository.paymentAttempt.mock.calls.map((c) => c[1])).toEqual([
    commandKey,
    commandKey,
  ]);
  expect(JSON.parse(s.raw()!).commands[0]).toMatchObject({
    attemptId: 'attempt',
    orderId: 'order_original',
  });
});
test('bound attempt/Order cannot be replaced by another retry response', async () => {
  const s = setup();
  await s.flow.start();
  s.execute.mockResolvedValue({
    ...attempt(),
    payment_attempt_id: 'replacement',
    provider_order_id: 'order_replacement',
  });
  await expect(s.flow.start()).rejects.toMatchObject({ kind: 'protocol' });
  expect(s.native.launch).toHaveBeenCalledTimes(1);
});
test('SDK success with delayed confirmation remains pending until the backend says SUCCEEDED', async () => {
  const s = setup();
  await s.flow.start();
  expect(s.flow.getSnapshot().payment?.status).toBe('PENDING');
  s.setPayment({
    status: 'CONFIRMING',
    action: 'WAIT',
    action_reason: 'VERIFICATION_REQUIRED',
    retry_allowed: false,
    verification_pending: true,
  });
  await jest.advanceTimersByTimeAsync(2500);
  expect(s.flow.getSnapshot().payment?.status).toBe('CONFIRMING');
  s.setPayment({
    status: 'SUCCEEDED',
    action: 'UNAVAILABLE',
    action_reason: 'PAYMENT_RECEIVED',
    verification_pending: false,
    succeeded_at: new Date().toISOString(),
  });
  await jest.advanceTimersByTimeAsync(5000);
  expect(s.flow.getSnapshot().payment?.status).toBe('SUCCEEDED');
  expect(s.execute).toHaveBeenCalledTimes(1);
});
test('lost SDK callback times out into verification; no second checkout while original native screen may be open', async () => {
  const s = setup();
  let finish!: () => void;
  s.native.launch.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const started = s.flow.start();
  await until(() => s.native.launch.mock.calls.length === 1);
  await jest.advanceTimersByTimeAsync(1001);
  await started;
  expect(s.flow.getSnapshot().nativeOutstanding).toBe(true);
  await s.flow.start();
  expect(s.execute).toHaveBeenCalledTimes(1);
  s.setPayment({
    status: 'SUCCEEDED',
    action: 'UNAVAILABLE',
    action_reason: 'PAYMENT_RECEIVED',
    succeeded_at: new Date().toISOString(),
  });
  finish();
  await until(() => s.flow.getSnapshot().payment?.status === 'SUCCEEDED');
});
test('bounded backoff stops after window, pauses in background, and manual refresh starts a finite new window', async () => {
  const s = setup();
  s.setPayment({
    status: 'CONFIRMING',
    action: 'WAIT',
    action_reason: 'VERIFICATION_REQUIRED',
    retry_allowed: false,
    verification_pending: true,
  });
  await s.flow.refresh();
  await jest.advanceTimersByTimeAsync(5000);
  s.flow.setForeground(false);
  const before = s.repository.payment.mock.calls.length;
  await jest.advanceTimersByTimeAsync(180001);
  expect(s.repository.payment).toHaveBeenCalledTimes(before);
  s.flow.setForeground(true);
  await s.flow.refresh();
  expect(s.flow.getSnapshot().verificationStopped).toBe(true);
  const stopped = s.repository.payment.mock.calls.length;
  await jest.advanceTimersByTimeAsync(600000);
  expect(s.repository.payment).toHaveBeenCalledTimes(stopped);
  await s.flow.refresh(true);
  expect(s.flow.getSnapshot().verificationStopped).toBe(false);
  await jest.advanceTimersByTimeAsync(180001);
  expect(s.flow.getSnapshot().verificationStopped).toBe(true);
  expect(s.repository.payment.mock.calls.length - stopped).toBeLessThan(25);
});
test('refresh is single flight and refreshes payment and owned detail together', async () => {
  const s = setup();
  const a = s.flow.refresh(),
    b = s.flow.refresh();
  expect(a).toBe(b);
  await a;
  expect(s.repository.payment).toHaveBeenCalledTimes(1);
  expect(s.repository.detail).toHaveBeenCalledTimes(1);
});
test('account change during preparation cannot launch or publish old-account state', async () => {
  const s = setup();
  let complete!: (v: PaymentAttempt) => void;
  s.execute.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const started = s.flow.start();
  await until(() => s.execute.mock.calls.length === 1);
  const before = s.flow.getSnapshot();
  s.setCurrent(false);
  complete(attempt());
  await expect(started).rejects.toMatchObject({ status: 401 });
  expect(s.native.launch).not.toHaveBeenCalled();
  expect(s.flow.getSnapshot()).toBe(before);
});
test('logout during a lost SDK callback releases local flight without publishing to the next account', async () => {
  const s = setup();
  s.native.launch.mockImplementation(() => new Promise(() => {}));
  const started = s.flow.start();
  await until(() => s.native.launch.mock.calls.length === 1);
  s.setCurrent(false);
  s.flow.dispose();
  await expect(started).rejects.toMatchObject({ status: 401 });
});
test('handoff authorization rechecks owner and deadline after lazy SDK loading', async () => {
  const s = setup();
  s.native.launch.mockImplementation(async (_p, authorize) => {
    s.setCurrent(false);
    authorize();
  });
  await expect(s.flow.start()).rejects.toMatchObject({ status: 401 });
});
test('cancellation remains independent while payment is uncertain; late capture does not restore booking', async () => {
  const s = setup();
  await s.flow.start();
  s.setStatus('CANCELLED');
  s.setPayment({
    status: 'CANCELLED',
    action: 'UNAVAILABLE',
    action_reason: 'BOOKING_INELIGIBLE',
    verification_pending: true,
    retry_allowed: false,
  });
  await s.flow.refresh();
  expect(s.flow.getSnapshot().detail?.status).toBe('CANCELLED');
  expect(s.flow.getSnapshot().payment?.verification_pending).toBe(true);
  await s.flow.start();
  expect(s.execute).toHaveBeenCalledTimes(1);
  s.setPayment({
    status: 'SUCCEEDED',
    action_reason: 'PAYMENT_RECEIVED',
    verification_pending: false,
    succeeded_at: new Date().toISOString(),
  });
  await s.flow.refresh();
  expect(s.flow.getSnapshot().detail?.status).toBe('CANCELLED');
  expect(s.flow.getSnapshot().payment?.status).toBe('SUCCEEDED');
});

test('only positive backend rejection of a never-exposed first Order permits a fresh key on the next explicit tap', async () => {
  const s = setup();
  const fresh = '22222222-2222-4222-8222-222222222222';
  jest
    .mocked(s.scope.newId)
    .mockReturnValueOnce(commandKey)
    .mockReturnValue(fresh);
  s.execute.mockResolvedValueOnce({
    ...attempt(),
    status: 'FAILED',
    provider_order_id: null,
    action: 'START',
    action_reason: 'NEW_PAYMENT',
    failure_code: 'RAZORPAY_ORDER_REJECTED',
    checkout_ready_until: null,
  });
  await s.flow.start();
  expect(s.native.launch).not.toHaveBeenCalled();
  expect(s.scope.newId).toHaveBeenCalledTimes(1);
  expect(JSON.parse(s.raw()!).commands[0].rejectedFirstAttempt).toBe(true);
  await s.flow.start();
  expect(s.repository.paymentAttempt.mock.calls.map((c) => c[1])).toEqual([
    commandKey,
    fresh,
  ]);
  expect(s.native.launch).toHaveBeenCalledTimes(1);
});
test('SDK errors and incomplete backend failure observations never authorize a fresh preparation key', async () => {
  const s = setup();
  s.execute.mockResolvedValue({
    ...attempt(),
    status: 'FAILED',
    provider_order_id: null,
    action: 'WAIT',
    action_reason: 'VERIFICATION_REQUIRED',
    failure_code: 'UNKNOWN',
    checkout_ready_until: null,
  });
  await s.flow.start();
  await s.flow.start();
  expect(s.scope.newId).toHaveBeenCalledTimes(1);
  expect(s.repository.paymentAttempt.mock.calls.map((c) => c[1])).toEqual([
    commandKey,
    commandKey,
  ]);
  expect(s.native.launch).not.toHaveBeenCalled();
});
test('background aborts in-flight verification, and foreground return makes one fresh read without extending deadline', async () => {
  const s = setup();
  s.setPayment({
    action: 'WAIT',
    action_reason: 'VERIFICATION_REQUIRED',
    verification_pending: true,
    retry_allowed: false,
  });
  let finish!: (value: PaymentRead) => void;
  s.repository.payment.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const old = s.flow.refresh();
  await until(() => s.repository.payment.mock.calls.length === 1);
  s.flow.setForeground(false);
  finish(pending());
  await expect(old).rejects.toMatchObject({ kind: 'cancelled' });
  expect(s.flow.getSnapshot().payment).toBeNull();
  s.flow.setForeground(true);
  await until(() => s.repository.payment.mock.calls.length === 2);
  await s.flow.refresh();
  expect(s.flow.getSnapshot().payment?.action).toBe('WAIT');
  await jest.advanceTimersByTimeAsync(180001);
  expect(s.flow.getSnapshot().verificationStopped).toBe(true);
});

test('same attempt cannot switch its persisted original Order', async () => {
  const s = setup();
  await s.flow.start();
  s.execute.mockResolvedValue({
    ...attempt(),
    provider_order_id: 'order_other',
  });
  await expect(s.flow.start()).rejects.toMatchObject({ kind: 'protocol' });
  expect(s.native.launch).toHaveBeenCalledTimes(1);
});
test('inconsistent payment identity across owned projections prevents preparation', async () => {
  const s = setup();
  s.repository.detail.mockResolvedValue({
    request_id: 'request',
    status: 'PENDING_PAYMENT',
    quote: { amount_minor: 35000, currency: 'INR' },
    payment: { ...pending(), payment_id: 'other-payment' },
  } as CollectionDetail);
  await expect(s.flow.start()).rejects.toMatchObject({ code: 'NOT_ELIGIBLE' });
  expect(s.execute).not.toHaveBeenCalled();
  expect(s.native.launch).not.toHaveBeenCalled();
});

test('verification budget remains bounded if the device wall clock moves backwards', async () => {
  const s = setup();
  s.setPayment({
    status: 'CONFIRMING',
    action: 'WAIT',
    action_reason: 'VERIFICATION_REQUIRED',
    retry_allowed: false,
    verification_pending: true,
  });
  await s.flow.refresh();
  jest.setSystemTime(Date.now() - 86400000);
  await jest.advanceTimersByTimeAsync(180001);
  expect(s.flow.getSnapshot().verificationStopped).toBe(true);
  const reads = s.repository.payment.mock.calls.length;
  await jest.advanceTimersByTimeAsync(600000);
  expect(s.repository.payment).toHaveBeenCalledTimes(reads);
});

test('uncertain preparation may finish successfully only when reconciliation returns backend SUCCEEDED', async () => {
  const s = setup();
  s.execute.mockImplementation(async () => {
    s.setPayment({
      status: 'SUCCEEDED',
      action: 'UNAVAILABLE',
      action_reason: 'PAYMENT_RECEIVED',
      retry_allowed: false,
      succeeded_at: new Date().toISOString(),
    });
    throw new ApiError(0, 'network');
  });
  await expect(s.flow.start()).resolves.toMatchObject({ status: 'SUCCEEDED' });
  expect(s.native.launch).not.toHaveBeenCalled();
  expect(s.flow.getSnapshot().error).toBeNull();
});

test.each([{ amount_minor: 0 }, { currency: 'USD' }])(
  'backend money projection remains readable, but cannot prepare INR checkout: %j',
  async (money) => {
    const s = setup();
    s.setPayment(money);
    await expect(s.flow.refresh()).resolves.toMatchObject(money);
    await expect(s.flow.start()).rejects.toMatchObject({
      code: 'NOT_ELIGIBLE',
    });
    expect(s.execute).not.toHaveBeenCalled();
    expect(s.native.launch).not.toHaveBeenCalled();
  },
);
