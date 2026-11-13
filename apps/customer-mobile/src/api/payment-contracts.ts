import type { PaymentAttempt } from './contracts';
import type {
  CheckoutParameters,
  PaymentAction,
  PaymentActionReason,
  PaymentRead,
} from './customer-contracts';
import { ApiError } from './errors';

const fail = (): never => {
  throw new ApiError(200, 'protocol');
};
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail();
export const paymentText = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= 200;
export const paymentDate = (v: unknown): v is string =>
  typeof v === 'string' &&
  /T.*(?:Z|[+-]\d\d:\d\d)$/.test(v) &&
  Number.isFinite(Date.parse(v));
export const futurePaymentDate = (v: unknown, now = Date.now()) =>
  paymentDate(v) && Date.parse(v) > now;
const nullableDate = (v: unknown) => v === null || paymentDate(v);
const nullableText = (v: unknown) => v === null || paymentText(v);
const money = (v: Record<string, unknown>, checkout = false) =>
  Number.isSafeInteger(v.amount_minor) &&
  (checkout
    ? (v.amount_minor as number) > 0
    : (v.amount_minor as number) >= 0) &&
  typeof v.currency === 'string' &&
  /^[A-Z]{3}$/.test(v.currency) &&
  (!checkout || v.currency === 'INR');
const reasons: PaymentActionReason[] = [
  'NEW_PAYMENT',
  'CHECKOUT_READY',
  'VERIFICATION_REQUIRED',
  'PREPARATION_IN_PROGRESS',
  'RECONCILIATION_REQUIRED',
  'BOOKING_INELIGIBLE',
  'ACCOUNT_MISMATCH',
  'PAYMENT_RECEIVED',
  'SUPERSEDED_ATTEMPT',
];
function permission(v: Record<string, unknown>) {
  if (
    typeof v.action !== 'string' ||
    typeof v.action_reason !== 'string' ||
    !nullableDate(v.checkout_ready_until)
  )
    fail();
  const known =
    ['START', 'RESUME', 'WAIT', 'UNAVAILABLE'].includes(v.action as string) &&
    reasons.includes(v.action_reason as PaymentActionReason);
  return {
    action: (known ? v.action : 'UNAVAILABLE') as PaymentAction,
    action_reason: (known ? v.action_reason : 'UNKNOWN') as PaymentActionReason,
    checkout_ready_until: known
      ? (v.checkout_ready_until as string | null)
      : null,
  };
}
export function parsePayment(value: unknown, requestId: string): PaymentRead {
  const v = object(value),
    p = permission(v);
  if (
    v.request_id !== requestId ||
    !paymentText(v.payment_id) ||
    !money(v) ||
    ![
      'PENDING',
      'PROCESSING',
      'SUCCEEDED',
      'FAILED',
      'CONFIRMING',
      'CANCELLED',
      'EXPIRED',
    ].includes(v.status as string) ||
    typeof v.retry_allowed !== 'boolean' ||
    typeof v.verification_pending !== 'boolean' ||
    !nullableDate(v.expires_at) ||
    !nullableDate(v.succeeded_at) ||
    (v.status === 'SUCCEEDED' && !paymentDate(v.succeeded_at))
  )
    fail();
  let currentAttempt: PaymentRead['current_attempt'] = null;
  if (v.current_attempt !== null) {
    const a = object(v.current_attempt);
    if (
      !paymentText(a.payment_attempt_id) ||
      !['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CONFIRMING'].includes(
        a.status as string,
      )
    )
      fail();
    currentAttempt = {
      payment_attempt_id: a.payment_attempt_id as string,
      status: a.status as NonNullable<PaymentRead['current_attempt']>['status'],
    };
  }
  const data = v as unknown as PaymentRead;
  return {
    request_id: requestId,
    payment_id: data.payment_id,
    amount_minor: data.amount_minor,
    currency: data.currency,
    status: data.status,
    expires_at: data.expires_at,
    succeeded_at: data.succeeded_at,
    verification_pending: data.verification_pending,
    current_attempt: currentAttempt,
    ...p,
    retry_allowed:
      v.retry_allowed === true && ['START', 'RESUME'].includes(p.action),
  };
}
export function parsePaymentAttempt(value: unknown): PaymentAttempt {
  const v = object(value),
    p = permission(v);
  if (
    !paymentText(v.payment_attempt_id) ||
    !paymentText(v.provider) ||
    ![
      'CREATED',
      'PENDING',
      'PROCESSING',
      'SUCCEEDED',
      'FAILED',
      'CONFIRMING',
      'INITIATION_UNCERTAIN',
    ].includes(v.status as string) ||
    !nullableText(v.provider_order_id) ||
    !nullableText(v.provider_payment_id) ||
    !nullableText(v.failure_code)
  )
    fail();
  const data = v as unknown as PaymentAttempt;
  return {
    payment_attempt_id: data.payment_attempt_id,
    status: data.status,
    provider: data.provider,
    provider_order_id: data.provider_order_id,
    provider_payment_id: data.provider_payment_id,
    failure_code: data.failure_code,
    ...p,
  };
}
export function parseCheckout(value: unknown): CheckoutParameters {
  const v = object(value);
  if (
    !paymentText(v.request_id) ||
    !paymentText(v.payment_attempt_id) ||
    v.provider !== 'RAZORPAY' ||
    typeof v.public_key_id !== 'string' ||
    !/^rzp_(test|live)_[A-Za-z0-9]{1,190}$/.test(v.public_key_id) ||
    typeof v.provider_order_id !== 'string' ||
    !/^order_[A-Za-z0-9]{1,190}$/.test(v.provider_order_id) ||
    !paymentText(v.merchant_display_name) ||
    !money(v, true) ||
    !paymentDate(v.expires_at) ||
    !paymentDate(v.checkout_ready_until)
  )
    fail();
  const data = v as unknown as CheckoutParameters;
  return {
    request_id: data.request_id,
    payment_attempt_id: data.payment_attempt_id,
    provider: data.provider,
    public_key_id: data.public_key_id,
    provider_order_id: data.provider_order_id,
    merchant_display_name: data.merchant_display_name,
    amount_minor: data.amount_minor,
    currency: data.currency,
    expires_at: data.expires_at,
    checkout_ready_until: data.checkout_ready_until,
  };
}
