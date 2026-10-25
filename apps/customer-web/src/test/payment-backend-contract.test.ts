import type {
  PaymentAttempt,
  RawPaymentAttemptStatus,
} from '../parity/api/contracts';
import type {
  PaymentRead,
  CheckoutParameters,
} from '../parity/api/customer-contracts';
import { paymentAttempt, payment } from '../parity/api/validation';
import { Transport } from '../parity/api/transport';
import { PaymentFlow } from '../features/payment';
import { memoryStorage } from '../platform/recovery';
import { harness, owner, other, response } from './helpers';

// Captured contract from backend b281e03: routes/payments._attempt_response
// returns raw service.ATTEMPT_*; customer_reads/projections maps these separately.
const id = (n: number) =>
  `12345678-1234-4234-8234-${String(n).padStart(12, '0')}`;
function raw(
  status: RawPaymentAttemptStatus,
  attemptId = id(1),
): PaymentAttempt {
  const rejected = status === 'FAILED',
    ready = status === 'PENDING',
    succeeded = status === 'SUCCEEDED';
  return {
    payment_attempt_id: attemptId,
    status,
    provider: 'RAZORPAY',
    provider_order_id: ready || succeeded ? 'order_contractExample' : null,
    provider_payment_id: succeeded ? 'pay_contractExample' : null,
    failure_code: rejected ? 'RAZORPAY_ORDER_REJECTED' : null,
    action: ready || rejected ? 'START' : succeeded ? 'UNAVAILABLE' : 'WAIT',
    action_reason: ready
      ? 'CHECKOUT_READY'
      : rejected
        ? 'NEW_PAYMENT'
        : succeeded
          ? 'PAYMENT_RECEIVED'
          : status === 'CREATED'
            ? 'PREPARATION_IN_PROGRESS'
            : 'VERIFICATION_REQUIRED',
    checkout_ready_until: ready
      ? new Date(Date.now() + 60000).toISOString()
      : null,
  };
}
function projection(attempt: PaymentAttempt | null): PaymentRead {
  const statuses = {
    CREATED: 'PROCESSING',
    PENDING: 'PENDING',
    INITIATION_UNCERTAIN: 'CONFIRMING',
    FAILED: 'FAILED',
    SUCCEEDED: 'SUCCEEDED',
  } as const;
  return {
    payment_id: other,
    request_id: owner,
    amount_minor: 35000,
    currency: 'INR',
    status: attempt ? statuses[attempt.status] : 'PENDING',
    retry_allowed: !attempt || ['START', 'RESUME'].includes(attempt.action),
    expires_at: new Date(Date.now() + 60000).toISOString(),
    succeeded_at:
      attempt?.status === 'SUCCEEDED' ? new Date().toISOString() : null,
    current_attempt: attempt
      ? {
          payment_attempt_id: attempt.payment_attempt_id,
          status: statuses[attempt.status],
        }
      : null,
    action: attempt?.action ?? 'START',
    action_reason: attempt?.action_reason ?? 'NEW_PAYMENT',
    verification_pending: !!attempt && attempt.action === 'WAIT',
    checkout_ready_until: attempt?.checkout_ready_until ?? null,
  };
}
async function boundary() {
  const h = harness();
  await h.login();
  const transport = new Transport(h.session),
    store = memoryStorage();
  const repo = {
    payment: () =>
      transport.request<PaymentRead>(
        `/v1/customer/collection-requests/${owner}/payment`,
      ),
    checkout: jest.fn((attemptId: string) =>
      transport.request<CheckoutParameters>(
        `/v1/customer/payment-attempts/${attemptId}/checkout`,
      ),
    ),
    prepare: (requestId: string, key: string) =>
      transport.command<PaymentAttempt>(
        `/v1/payments/collection-requests/${requestId}/attempts`,
        { method: 'POST', headers: { 'Idempotency-Key': key } },
      ),
  };
  const sdk = {
    available: () => true,
    prepare: jest.fn(async () => {}),
    launch: jest.fn(async () => {}),
    close: jest.fn(),
  };
  const makeFlow = () => new PaymentFlow(owner, repo, sdk, store, () => true);
  return { h, transport, repo, store, sdk, makeFlow };
}
test.each([
  'CREATED',
  'PENDING',
  'INITIATION_UNCERTAIN',
  'FAILED',
  'SUCCEEDED',
] as const)(
  'raw attempt HTTP response accepts exact backend state %s without altering the payment projection',
  async (status) => {
    const b = await boundary();
    const attempt = raw(status);
    b.h.fetcher.mockResolvedValue(response(attempt, 201));
    const value = await b.repo.prepare(owner, crypto.randomUUID()).execute();
    expect(value.status).toBe(status);
    expect(paymentAttempt(attempt).status).toBe(status);
    expect(payment(projection(attempt)).current_attempt?.status).toBe(
      projection(attempt).current_attempt?.status,
    );
    await b.h.session.logout();
  },
);
test.each(['PROCESSING', 'CONFIRMING', 'CANCELLED', 'EXPIRED', 'UNKNOWN'])(
  'projection-only/unknown state %s is not a raw preparation state',
  (status) =>
    expect(() => paymentAttempt({ ...raw('PENDING'), status })).toThrow(),
);
test.each(['CREATED', 'INITIATION_UNCERTAIN'])(
  'raw state %s cannot appear in the independent customer-facing financial projection',
  (status) => expect(() => payment({ ...projection(null), status })).toThrow(),
);
test.each(['CREATED', 'INITIATION_UNCERTAIN', 'FAILED', 'SUCCEEDED'] as const)(
  'coordinator consumes raw %s and reads the independent financial result without checkout',
  async (status) => {
    const b = await boundary();
    let current = projection(null);
    b.h.fetcher.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/payment')) return response(current);
      if (init?.method === 'POST') {
        const attempt = raw(status);
        current = projection(attempt);
        return response(attempt, 201);
      }
      throw Error('Unexpected checkout');
    });
    const result = await b.makeFlow().start(new AbortController().signal);
    expect(result.status).toBe(projection(raw(status)).status);
    expect(b.sdk.launch).not.toHaveBeenCalled();
    expect(b.repo.checkout).not.toHaveBeenCalled();
    await b.h.session.logout();
  },
);
test.each([undefined, id(1), id(7)])(
  'authoritative rejected order retires obsolete identity with saved attemptId=%s',
  async (savedAttemptId) => {
    const b = await boundary(),
      oldKey = crypto.randomUUID();
    await b.store.set(
      JSON.stringify({
        requestId: owner,
        key: oldKey,
        ...(savedAttemptId ? { attemptId: savedAttemptId } : {}),
      }),
    );
    let current = projection(raw('FAILED'));
    const keys: string[] = [];
    b.h.fetcher.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/payment')) return response(current);
      keys.push((init?.headers as Record<string, string>)['Idempotency-Key']!);
      const attempt = raw('CREATED', id(2));
      current = projection(attempt);
      return response(attempt, 201);
    });
    expect(
      (await b.makeFlow().start(new AbortController().signal)).status,
    ).toBe('PROCESSING');
    expect(keys).toHaveLength(1);
    expect(keys[0]).not.toBe(oldKey);
    expect(JSON.parse((await b.store.get())!).rejectedAttemptId).toBe(id(1));
    expect(b.sdk.launch).not.toHaveBeenCalled();
    await b.h.session.logout();
  },
);
test('lost preparation -> rejected initial order -> newly authorized preparation -> lost response/stale read/restart replays only the new identity', async () => {
  const b = await boundary();
  let current = projection(null),
    posts = 0;
  const keys: string[] = [],
    attempts = new Map<string, PaymentAttempt>();
  b.h.fetcher.mockImplementation(async (input, init) => {
    if (String(input).endsWith('/payment')) return response(current);
    const key = (init?.headers as Record<string, string>)['Idempotency-Key']!;
    keys.push(key);
    posts++;
    if (posts === 1) {
      const failed = raw('FAILED');
      attempts.set(key, failed);
      current = projection(failed);
      throw Error('Lost preparation response before attempt ID persistence');
    }
    if (posts === 2) {
      attempts.set(key, raw('CREATED', id(2)));
      throw Error(
        'Lost new preparation response; old failed read still visible',
      );
    }
    const attempt = attempts.get(key);
    if (!attempt) throw Error('Created an unauthorized third identity');
    current = projection(attempt);
    return response(attempt, 201);
  });
  await expect(
    b.makeFlow().start(new AbortController().signal),
  ).rejects.toThrow();
  const first = JSON.parse((await b.store.get())!);
  expect(first.attemptId).toBeUndefined();
  expect(first.rejectedAttemptId).toBeUndefined();
  await expect(
    b.makeFlow().start(new AbortController().signal),
  ).rejects.toThrow();
  const second = JSON.parse((await b.store.get())!);
  expect(second.key).not.toBe(first.key);
  expect(second.rejectedAttemptId).toBe(id(1));
  expect(second.attemptId).toBeUndefined();
  expect((await b.makeFlow().start(new AbortController().signal)).status).toBe(
    'PROCESSING',
  );
  expect(keys).toEqual([first.key, second.key, second.key]);
  expect(attempts.size).toBe(2);
  expect(b.sdk.launch).not.toHaveBeenCalled();
  expect((await b.makeFlow().start(new AbortController().signal)).action).toBe(
    'WAIT',
  );
  expect(keys).toHaveLength(3);
  await b.h.session.logout();
});
test.each(['CREATED', 'INITIATION_UNCERTAIN'] as const)(
  'lost genuinely uncertain %s keeps original identity and never creates another attempt',
  async (status) => {
    const b = await boundary();
    let current = projection(null),
      posts = 0;
    const keys: string[] = [];
    b.h.fetcher.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/payment')) return response(current);
      posts++;
      keys.push((init?.headers as Record<string, string>)['Idempotency-Key']!);
      current = projection(raw(status));
      throw Error('Lost response');
    });
    await expect(
      b.makeFlow().start(new AbortController().signal),
    ).rejects.toThrow();
    const saved = await b.store.get();
    expect(
      (await b.makeFlow().start(new AbortController().signal)).action,
    ).toBe('WAIT');
    expect(await b.store.get()).toBe(saved);
    expect(posts).toBe(1);
    expect(keys).toHaveLength(1);
    expect(b.sdk.launch).not.toHaveBeenCalled();
    await b.h.session.logout();
  },
);
test('lost preparation with no visible attempt replays the existing key rather than guessing failure', async () => {
  const b = await boundary();
  let posts = 0,
    current = projection(null);
  const keys: string[] = [];
  b.h.fetcher.mockImplementation(async (input, init) => {
    if (String(input).endsWith('/payment')) return response(current);
    posts++;
    keys.push((init?.headers as Record<string, string>)['Idempotency-Key']!);
    if (posts === 1) throw Error('Transaction may still commit');
    const attempt = raw('INITIATION_UNCERTAIN');
    current = projection(attempt);
    return response(attempt, 201);
  });
  await expect(
    b.makeFlow().start(new AbortController().signal),
  ).rejects.toThrow();
  expect((await b.makeFlow().start(new AbortController().signal)).status).toBe(
    'CONFIRMING',
  );
  expect(keys[0]).toBe(keys[1]);
  await b.h.session.logout();
});
