import type {
  CheckoutParameters,
  PaymentRead,
} from '../../api/customer-contracts';
import type { CustomerRepositories } from './repository';
import { ApiError } from '../../api/errors';
// A future provider SDK adapter implements this single native boundary after runtime/device validation.
export interface NativeCheckout {
  launch(parameters: CheckoutParameters): Promise<void>;
}
export function paymentFlow(
  id: string,
  repository: Pick<
    CustomerRepositories,
    'payment' | 'paymentAttempt' | 'checkout'
  >,
  native: NativeCheckout | null,
) {
  let prepared: ReturnType<CustomerRepositories['paymentAttempt']> | null =
    null;
  let launched = false,
    flight: Promise<PaymentRead> | null = null;
  const run = async () => {
    const current = await repository.payment(id);
    if (current.status === 'SUCCEEDED' || launched) return current;
    if (!native) throw new ApiError(0, 'backendPending');
    if (
      current.request_id !== id ||
      !['PENDING', 'FAILED'].includes(current.status) ||
      !current.retry_allowed ||
      (current.expires_at !== null &&
        (!Number.isFinite(Date.parse(current.expires_at)) ||
          Date.parse(current.expires_at) <= Date.now()))
    )
      throw new ApiError(409, 'http', 'NOT_ELIGIBLE');
    prepared ??= repository.paymentAttempt(id);
    const attempt = await prepared.execute();
    const parameters = await repository.checkout(attempt.payment_attempt_id);
    if (
      parameters.request_id !== id ||
      parameters.payment_attempt_id !== attempt.payment_attempt_id ||
      parameters.provider !== 'RAZORPAY' ||
      !parameters.public_key_id ||
      !parameters.provider_order_id ||
      !parameters.merchant_display_name ||
      parameters.amount_minor !== current.amount_minor ||
      parameters.currency !== current.currency ||
      !Number.isSafeInteger(parameters.amount_minor) ||
      parameters.amount_minor <= 0 ||
      !Number.isFinite(Date.parse(parameters.expires_at)) ||
      Date.parse(parameters.expires_at) <= Date.now()
    )
      throw new ApiError(200, 'protocol');
    launched = true;
    try {
      await native.launch(parameters);
    } catch {
      /* Provider dismissal/error is a signal, never financial truth. */
    }
    return repository.payment(id);
  };
  return {
    start() {
      if (!flight) {
        const operation = run();
        flight = operation;
        void operation.then(
          () => {
            if (flight === operation) flight = null;
          },
          () => {
            if (flight === operation) flight = null;
          },
        );
      }
      return flight;
    },
  };
}
