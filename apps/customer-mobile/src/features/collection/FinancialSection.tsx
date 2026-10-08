import { View } from 'react-native';
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositories, nativeCheckout } from '../../lib/repositories';
import { previewCatalogue } from '../../lib/runtime';
import {
  Body,
  Button,
  Card,
  Heading,
  Skeleton,
  StatusCard,
} from '../../components/ui';
import type { CollectionDetail } from '../../api/customer-contracts';
import { moneyLabel, paymentLabel, refundLabels } from './financial';
import { useCustomerOwner } from './queries';
import { paymentFlow, type NativeCheckout } from './paymentFlow';
import { invalidateCollection } from './cancellation';
export default function FinancialSection({
  detail,
  checkout = nativeCheckout,
}: {
  detail: CollectionDetail;
  checkout?: NativeCheckout | null;
}) {
  const owner = useCustomerOwner();
  const queryClient = useQueryClient();
  const flow = useMemo(
    () =>
      paymentFlow(
        detail.request_id,
        repositories,
        previewCatalogue ? null : checkout,
      ),
    [detail.request_id, checkout],
  );
  const pay = useMutation({
    mutationFn: () => flow.start(),
    onSuccess: () =>
      invalidateCollection(queryClient, owner, detail.request_id),
    retry: false,
  });
  const payment = useQuery({
    queryKey: ['payment', owner, detail.request_id],
    queryFn: ({ signal }) => repositories.payment(detail.request_id, signal),
    refetchInterval: (query) =>
      ['PENDING', 'PROCESSING', 'CONFIRMING'].includes(
        query.state.data?.status ?? '',
      )
        ? 10000
        : false,
  });
  const refunds = useQuery({
    queryKey: ['refunds', owner, detail.request_id],
    queryFn: ({ signal }) => repositories.refunds(detail.request_id, signal),
    enabled: detail.status === 'CANCELLED' || !!detail.refunds.length,
    refetchInterval: (query) =>
      query.state.data?.refunds.some((refund) =>
        ['INITIATED', 'PROCESSING', 'CONFIRMING'].includes(refund.status),
      )
        ? 20000
        : false,
  });
  const currentPayment = payment.data ?? detail.payment;
  const currentRefunds = refunds.data?.refunds ?? detail.refunds;
  return (
    <View style={{ gap: 16 }}>
      <Card>
        <Heading style={{ fontSize: 27 }}>Payment</Heading>
        <Body style={{ color: '#111111' }}>
          {moneyLabel(currentPayment.amount_minor, currentPayment.currency)}
        </Body>
        <Body accessibilityLiveRegion="polite">
          {paymentLabel(currentPayment.status)}
        </Body>
        {payment.isPending && <Skeleton height={36} />}
        {payment.isError && (
          <StatusCard
            title="Unable to refresh payment"
            error={payment.error}
            retry={() => void payment.refetch()}
          />
        )}
        {['PENDING', 'PROCESSING', 'CONFIRMING'].includes(
          currentPayment.status,
        ) && (
          <Body>
            We’re checking the payment with Tirodhan. Closing checkout or
            returning from your bank does not confirm payment.
          </Body>
        )}
        {currentPayment.retry_allowed && (
          <>
            <Button
              label="Continue to secure payment"
              disabled={previewCatalogue || !checkout}
              busy={pay.isPending}
              onPress={() => pay.mutate()}
            />
            {(previewCatalogue || !checkout) && (
              <Body>
                {previewCatalogue
                  ? 'Development preview: provider checkout is not connected.'
                  : 'Secure checkout will be available when the payment integration is connected.'}
              </Body>
            )}
          </>
        )}
        {pay.isError && (
          <StatusCard
            title="Unable to continue payment"
            error={pay.error}
            retry={() => pay.mutate()}
          />
        )}
        <Button
          secondary
          label="Refresh payment status"
          onPress={() => void payment.refetch()}
        />
      </Card>
      {(detail.status === 'CANCELLED' || currentRefunds.length > 0) && (
        <Card>
          <Heading style={{ fontSize: 27 }}>Refund</Heading>
          {currentRefunds.length === 0 && (
            <Body>
              Your pickup is cancelled. Refund eligibility and progress are
              being checked; cancellation does not confirm a completed refund.
            </Body>
          )}
          {currentRefunds.map((refund) => (
            <View key={refund.refund_id} style={{ gap: 6, paddingVertical: 8 }}>
              <Body style={{ color: '#111111' }}>
                {moneyLabel(refund.amount_minor, refund.currency)}
              </Body>
              <Body accessibilityLiveRegion="polite">
                {refundLabels[refund.status] ??
                  'Refund information unavailable'}
              </Body>
              {refund.status === 'CONFIRMING' && (
                <Body>
                  We’re confirming your refund with the payment provider. Please
                  check back for an update.
                </Body>
              )}
              {refund.status === 'FAILED' && (
                <Body>
                  Your refund needs attention. Please use Help & Support for
                  assistance.
                </Body>
              )}
              {refund.status === 'COMPLETED' && refund.completed_at && (
                <Body>
                  Completed{' '}
                  {new Date(refund.completed_at).toLocaleDateString('en-IN')}
                </Body>
              )}
              {refund.status !== 'COMPLETED' && (
                <Body>
                  Initiated{' '}
                  {new Date(refund.initiated_at).toLocaleDateString('en-IN')}
                </Body>
              )}
            </View>
          ))}
          {refunds.isError && (
            <StatusCard
              title="Unable to refresh refund"
              error={refunds.error}
              retry={() => void refunds.refetch()}
            />
          )}
          <Button
            secondary
            label="Refresh refund status"
            onPress={() => void refunds.refetch()}
          />
        </Card>
      )}
    </View>
  );
}
