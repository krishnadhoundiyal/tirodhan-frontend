import { createRazorpayAdapter } from '../features/collection/razorpayAdapter';
import {
  parsePayment,
  parsePaymentAttempt,
  parseCheckout,
} from '../api/payment-contracts';
import type { CheckoutParameters } from '../api/customer-contracts';

const parameters = (): CheckoutParameters => ({
  request_id: 'request',
  payment_attempt_id: 'attempt',
  provider: 'RAZORPAY',
  public_key_id: 'rzp_test_example',
  provider_order_id: 'order_original',
  merchant_display_name: 'Tirodhan Backend Merchant',
  amount_minor: 35000,
  currency: 'INR',
  expires_at: new Date(Date.now() + 300000).toISOString(),
  checkout_ready_until: new Date(Date.now() + 60000).toISOString(),
});
function projection() {
  return {
    payment_id: 'payment',
    request_id: 'request',
    amount_minor: 35000,
    currency: 'INR',
    status: 'PENDING',
    action: 'START',
    action_reason: 'NEW_PAYMENT',
    retry_allowed: true,
    verification_pending: false,
    checkout_ready_until: null,
    expires_at: parameters().expires_at,
    succeeded_at: null,
    current_attempt: null,
  };
}
test('Razorpay adapter passes only backend checkout money/merchant/Order and discards callback payloads', async () => {
  const sdk = {
    open: jest.fn().mockResolvedValue({
      razorpay_payment_id: 'provider-data',
      signature: 'secret',
    }),
  };
  const load = jest.fn(async () => sdk),
    authorize = jest.fn();
  const adapter = createRazorpayAdapter(() => true, load);
  await expect(
    adapter.launch(parameters(), authorize),
  ).resolves.toBeUndefined();
  expect(authorize).toHaveBeenCalledTimes(1);
  expect(sdk.open).toHaveBeenCalledWith({
    key: 'rzp_test_example',
    order_id: 'order_original',
    amount: 35000,
    currency: 'INR',
    name: 'Tirodhan Backend Merchant',
  });
  sdk.open.mockRejectedValue({ financial_secret: 'raw gateway error' });
  await expect(
    adapter.launch(parameters(), authorize),
  ).resolves.toBeUndefined();
});
test.each(['SCREEN_PREVIEW', 'Expo Go', 'web'])(
  '%s guard prevents SDK loading and invocation',
  async () => {
    const load = jest.fn();
    const adapter = createRazorpayAdapter(() => false, load);
    expect(adapter.available?.()).toBe(false);
    await expect(adapter.launch(parameters(), jest.fn())).rejects.toMatchObject(
      { kind: 'backendPending' },
    );
    expect(load).not.toHaveBeenCalled();
  },
);
test('adapter rechecks permission and runtime after lazy loading; account loss cannot open SDK', async () => {
  let allowed = true;
  const sdk = { open: jest.fn() };
  const adapter = createRazorpayAdapter(
    () => allowed,
    async () => {
      allowed = false;
      return sdk;
    },
  );
  await expect(adapter.launch(parameters(), jest.fn())).rejects.toMatchObject({
    kind: 'backendPending',
  });
  expect(sdk.open).not.toHaveBeenCalled();
});
test('expired readiness during SDK load is rejected, and global SDK listener ownership serializes different bookings', async () => {
  jest.useFakeTimers();
  try {
    const p = parameters(),
      sdk = { open: jest.fn(async () => {}) };
    const stale = createRazorpayAdapter(
      () => true,
      async () => {
        jest.setSystemTime(Date.now() + 60001);
        return sdk;
      },
    );
    await expect(stale.launch(p, jest.fn())).rejects.toMatchObject({
      status: 409,
    });
    expect(sdk.open).not.toHaveBeenCalled();
    let finish!: () => void;
    sdk.open.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const a = createRazorpayAdapter(
        () => true,
        async () => sdk,
      ),
      b = createRazorpayAdapter(
        () => true,
        async () => sdk,
      );
    const running = a.launch(parameters(), jest.fn());
    await Promise.resolve();
    await Promise.resolve();
    await expect(b.launch(parameters(), jest.fn())).rejects.toMatchObject({
      kind: 'backendPending',
    });
    finish();
    await running;
  } finally {
    jest.useRealTimers();
  }
});
test('SDK module loading errors are sanitized', async () => {
  const adapter = createRazorpayAdapter(
    () => true,
    async () => {
      throw new Error('raw credentials');
    },
  );
  await expect(adapter.launch(parameters(), jest.fn())).rejects.toMatchObject({
    kind: 'configuration',
    message: 'Request configuration',
  });
});
test('payment parser requires current backend fields and verified success timestamp, unknown permission fails closed', () => {
  const p = projection();
  expect(
    parsePayment(
      { ...p, action: 'FUTURE', action_reason: 'FUTURE_REASON' },
      'request',
    ),
  ).toMatchObject({
    action: 'UNAVAILABLE',
    action_reason: 'UNKNOWN',
    retry_allowed: false,
  });
  expect(() =>
    parsePayment({ ...p, status: 'SUCCEEDED', succeeded_at: null }, 'request'),
  ).toThrow();
  expect(() =>
    parsePayment({ ...p, request_id: 'other' }, 'request'),
  ).toThrow();
  expect(() => parsePayment({ ...p, action: undefined }, 'request')).toThrow();
  expect(() =>
    parsePayment({ ...p, current_attempt: {} }, 'request'),
  ).toThrow();
  expect(() => parseCheckout({ ...parameters(), currency: 'USD' })).toThrow();
  expect(() =>
    parsePaymentAttempt({ payment_attempt_id: 'attempt', action: 'START' }),
  ).toThrow();
});

test('financial DTOs discard unknown provider payloads before entering application state', () => {
  const extra = { provider_payload: { secret: 'must not enter state' } };
  const p = parsePayment(
    {
      ...projection(),
      ...extra,
      current_attempt: {
        payment_attempt_id: 'attempt',
        status: 'PENDING',
        ...extra,
      },
    },
    'request',
  );
  expect(JSON.stringify(p)).not.toContain('provider_payload');
  expect(parseCheckout({ ...parameters(), ...extra })).not.toHaveProperty(
    'provider_payload',
  );
  expect(
    parsePaymentAttempt({
      payment_attempt_id: 'attempt',
      provider: 'RAZORPAY',
      status: 'PENDING',
      provider_order_id: 'order_original',
      provider_payment_id: null,
      failure_code: null,
      action: 'START',
      action_reason: 'CHECKOUT_READY',
      checkout_ready_until: parameters().checkout_ready_until,
      ...extra,
    }),
  ).not.toHaveProperty('provider_payload');
});
