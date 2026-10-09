import type { PaymentRead, RefundStatus } from '../../api/customer-contracts';
export const refundLabels: Record<RefundStatus, string> = {
  INITIATED: 'Refund initiated',
  PROCESSING: 'Refund processing',
  COMPLETED: 'Refund completed',
  CONFIRMING: 'Refund awaiting confirmation',
  FAILED: 'Refund needs attention',
};
export function moneyLabel(amount: number, currency: string) {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    !/^[A-Z]{3}$/.test(currency)
  )
    return 'Amount unavailable';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}
export function paymentLabel(status: PaymentRead['status']) {
  return (
    {
      PENDING: 'Payment pending',
      PROCESSING: 'Payment processing',
      SUCCEEDED: 'Payment received',
      FAILED: 'Payment unsuccessful',
      CONFIRMING: 'Payment awaiting confirmation',
      CANCELLED: 'Payment cancelled',
      EXPIRED: 'Payment window expired',
    }[status] ?? 'Payment status unavailable'
  );
}
