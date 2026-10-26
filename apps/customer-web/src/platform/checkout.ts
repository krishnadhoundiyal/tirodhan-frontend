import type { CheckoutParameters } from '../parity/api/customer-contracts';
import { ApiError } from '../parity/api/errors';
export interface CheckoutPort {
  available(): boolean;
  prepare(signal: AbortSignal): Promise<void>;
  launch(parameters: CheckoutParameters, signal: AbortSignal): Promise<void>;
  close(): void;
}
interface RazorpayInstance {
  open(): void;
  close(): void;
  on(name: 'payment.failed', fn: () => void): void;
}
export type RazorpayConstructor = new (options: {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  handler: () => void;
  modal: { ondismiss: () => void };
  retry: { enabled: false };
}) => RazorpayInstance;
export interface CheckoutApproval {
  approved: boolean;
  approvalReference: string;
  browserOrigin: string;
  environment: 'nonprod';
}
/** Official hosted browser SDK, loaded only following explicit payment action and approval.
 * Callbacks deliberately discard provider data; backend projection establishes status. */
export function razorpayCheckout(
  config: CheckoutApproval | null,
  environment: {
    origin: string;
    secure: boolean;
    document: Document;
    constructor: () => RazorpayConstructor | undefined;
  },
): CheckoutPort {
  let sdk: RazorpayConstructor | undefined,
    flight: Promise<void> | null = null,
    active: RazorpayInstance | null = null;
  let cancelActive: (() => void) | null = null;
  const available = () => {
    try {
      return (
        !!config &&
        config.approved === true &&
        config.approvalReference.trim().length > 0 &&
        config.environment === 'nonprod' &&
        config.browserOrigin === environment.origin &&
        environment.secure &&
        new URL(config.browserOrigin).protocol === 'https:'
      );
    } catch {
      return false;
    }
  };
  return {
    available,
    async prepare(signal) {
      if (!available() || signal.aborted)
        throw new ApiError(0, 'configuration');
      if (sdk) return;
      if (!flight)
        flight = new Promise<void>((resolve, reject) => {
          const script = environment.document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.async = true;
          script.referrerPolicy = 'no-referrer';
          const finish = (error?: ApiError) => {
            clearTimeout(timer);
            script.onload = script.onerror = null;
            if (error) {
              script.remove();
              reject(error);
            } else resolve();
          };
          const timer = setTimeout(
            () => finish(new ApiError(0, 'timeout')),
            15000,
          );
          script.onload = () => {
            sdk = environment.constructor();
            finish(sdk ? undefined : new ApiError(0, 'configuration'));
          };
          script.onerror = () => finish(new ApiError(0, 'network'));
          environment.document.head.append(script);
        });
      try {
        await flight;
      } catch (error) {
        flight = null;
        throw error;
      }
      if (signal.aborted) throw new ApiError(0, 'cancelled');
    },
    async launch(p, signal) {
      if (
        !available() ||
        !sdk ||
        !!active ||
        signal.aborted ||
        !/^rzp_test_[A-Za-z0-9]+$/.test(p.public_key_id) ||
        !/^order_[A-Za-z0-9]{1,190}$/.test(p.provider_order_id) ||
        !Number.isSafeInteger(p.amount_minor) ||
        p.amount_minor <= 0 ||
        p.currency !== 'INR' ||
        Date.parse(p.expires_at) <= Date.now() ||
        Date.parse(p.checkout_ready_until) <= Date.now()
      )
        throw new ApiError(0, 'configuration');
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (error?: ApiError) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener('abort', cancel);
          const closing = active;
          active = null;
          cancelActive = null;
          closing?.close();
          if (error) reject(error);
          else resolve();
        };
        const cancel = () => {
          finish(new ApiError(0, 'cancelled'));
        };
        const timer = setTimeout(
          finish,
          Math.max(
            1,
            Math.min(
              300000,
              Date.parse(p.checkout_ready_until) - Date.now(),
              Date.parse(p.expires_at) - Date.now(),
            ),
          ),
        );
        signal.addEventListener('abort', cancel, { once: true });
        cancelActive = cancel;
        try {
          active = new sdk!({
            key: p.public_key_id,
            order_id: p.provider_order_id,
            amount: p.amount_minor,
            currency: p.currency,
            name: p.merchant_display_name,
            handler: () => finish(),
            modal: { ondismiss: () => finish() },
            retry: { enabled: false },
          });
          active.on('payment.failed', () => finish());
          active.open();
        } catch {
          finish(new ApiError(0, 'configuration'));
        }
      });
    },
    close() {
      cancelActive?.();
    },
  };
}
