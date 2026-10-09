import { paymentFlow } from '../features/collection/paymentFlow';
import type {
  CheckoutParameters,
  PaymentRead,
} from '../api/customer-contracts';
import { ApiError } from '../api/errors';
const pending: PaymentRead = {
  request_id: 'request',
  payment_id: 'payment',
  amount_minor: 35000,
  currency: 'INR',
  status: 'PENDING',
  retry_allowed: true,
  expires_at: new Date(Date.now() + 300000).toISOString(),
  succeeded_at: null,
  current_attempt: null,
};
const parameters: CheckoutParameters = {
  request_id: 'request',
  payment_attempt_id: 'attempt',
  provider: 'RAZORPAY',
  public_key_id: 'rzp_test_example',
  provider_order_id: 'order_example',
  merchant_display_name: 'Tirodhan',
  amount_minor: 35000,
  currency: 'INR',
  expires_at: pending.expires_at!,
};
function setup() {
  const execute = jest
    .fn()
    .mockResolvedValue({ payment_attempt_id: 'attempt' });
  const repository = {
    payment: jest.fn().mockResolvedValue(pending),
    paymentAttempt: jest.fn(() => ({ execute })),
    checkout: jest.fn().mockResolvedValue(parameters),
  };
  const native = { launch: jest.fn().mockResolvedValue(undefined) };
  return { repository, native, execute };
}
test('missing native runtime blocks before creating any payment attempt', async () => {
  const { repository } = setup();
  await expect(
    paymentFlow('request', repository, null).start(),
  ).rejects.toMatchObject({ kind: 'backendPending' });
  expect(repository.paymentAttempt).not.toHaveBeenCalled();
});
test('provider return cannot accept payment; authoritative post-return read is the result and launch is once', async () => {
  const { repository, native } = setup(),
    flow = paymentFlow('request', repository, native);
  await expect(flow.start()).resolves.toMatchObject({ status: 'PENDING' });
  await flow.start();
  expect(native.launch).toHaveBeenCalledTimes(1);
  expect(repository.payment).toHaveBeenCalledTimes(3);
});
test('native failure/dismissal still reads server; mismatched public quote never launches', async () => {
  const { repository, native } = setup();
  native.launch.mockRejectedValue(new Error('provider return failed'));
  await expect(
    paymentFlow('request', repository, native).start(),
  ).resolves.toMatchObject({ status: 'PENDING' });
  native.launch.mockClear();
  repository.checkout.mockResolvedValue({ ...parameters, amount_minor: 1 });
  await expect(
    paymentFlow('request', repository, native).start(),
  ).rejects.toMatchObject({ kind: 'protocol' });
  expect(native.launch).not.toHaveBeenCalled();
});
test('uncertain attempt reuses prepared command and simultaneous starts share one flight', async () => {
  const { repository, native, execute } = setup(),
    flow = paymentFlow('request', repository, native);
  execute.mockRejectedValueOnce(new ApiError(0, 'network'));
  await expect(flow.start()).rejects.toMatchObject({ kind: 'network' });
  const first = flow.start(),
    second = flow.start();
  expect(first).toBe(second);
  await first;
  expect(repository.paymentAttempt).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledTimes(2);
});
