import type { CheckoutParameters } from '../../api/customer-contracts';
import { ApiError } from '../../api/errors';
import { futurePaymentDate, parseCheckout } from '../../api/payment-contracts';
import type { NativeCheckout } from './paymentFlow';

export interface RazorpaySdk {
  open(options: {
    key: string;
    order_id: string;
    amount: number;
    currency: string;
    name: string;
  }): Promise<unknown>;
}
// The SDK uses process-wide listeners. Never open two screens, even for different accounts.
let active = false;
export function createRazorpayAdapter(
  allowed: () => boolean,
  load: () => Promise<RazorpaySdk>,
): NativeCheckout {
  return {
    available: () => allowed() && !active,
    async launch(input: CheckoutParameters, authorize: () => void) {
      if (!allowed() || active) throw new ApiError(0, 'backendPending');
      active = true;
      try {
        const sdk = await load();
        if (!allowed()) throw new ApiError(0, 'backendPending');
        const p = parseCheckout(input);
        authorize();
        if (
          !futurePaymentDate(p.expires_at) ||
          !futurePaymentDate(p.checkout_ready_until)
        )
          throw new ApiError(409, 'http', 'NOT_ELIGIBLE');
        // Every financial and merchant option comes unchanged from the owned checkout GET.
        await sdk
          .open({
            key: p.public_key_id,
            order_id: p.provider_order_id,
            amount: p.amount_minor,
            currency: p.currency,
            name: p.merchant_display_name,
          })
          .then(
            () => {},
            () => {},
          );
      } catch (error) {
        // Never retain/log/propagate provider payloads or native exception details.
        throw error instanceof ApiError
          ? error
          : new ApiError(0, 'configuration');
      } finally {
        active = false;
      }
    },
  };
}
