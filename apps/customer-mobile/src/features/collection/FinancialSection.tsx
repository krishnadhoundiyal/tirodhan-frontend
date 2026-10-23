import { AppState, Platform, View } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { useFocusEffect } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { repositories, nativeCheckout } from '../../lib/repositories';
import { previewCatalogue } from '../../lib/runtime';
import { navigationOwner, navigationSession } from '../../lib/navigation';
import { paymentRecovery } from '../../session/paymentRecovery';
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
import {
  paymentFlow,
  paymentVerificationWindow,
  sharedPaymentFlow,
  type NativeCheckout,
} from './paymentFlow';
import { invalidateCollection } from './cancellation';

export default function FinancialSection({
  detail,
  checkout = nativeCheckout,
}: {
  detail: CollectionDetail;
  checkout?: NativeCheckout | null;
}) {
  const owner = useCustomerOwner(),
    queryClient = useQueryClient();
  const [foreground, setForeground] = useState(false);
  const nativeAllowed =
    !previewCatalogue && Platform.OS !== 'web' && !isRunningInExpoGo();
  const generation = navigationSession.getSnapshot().ownerVersion;
  const flow = useMemo(
    () =>
      sharedPaymentFlow(
        owner +
          ':' +
          generation +
          ':' +
          detail.request_id +
          ':' +
          (nativeAllowed ? 'native' : 'read'),
        () =>
          paymentFlow(
            detail.request_id,
            repositories,
            nativeAllowed ? checkout : null,
            {
              owner,
              isCurrent: () => {
                const current = navigationSession.getSnapshot();
                return (
                  navigationOwner(current) === owner &&
                  current.ownerVersion === generation
                );
              },
              recovery: nativeAllowed ? paymentRecovery : null,
              newId: randomUUID,
              verificationWindowMs: paymentVerificationWindow(
                process.env.EXPO_PUBLIC_PAYMENT_VERIFICATION_WINDOW_MS,
              ),
            },
          ),
      ),
    [owner, generation, detail.request_id, checkout, nativeAllowed],
  );
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot);
  useFocusEffect(
    useCallback(() => {
      const update = (active: boolean) => {
        setForeground(active);
        flow.setForeground(active);
      };
      update(AppState.currentState === 'active');
      const subscription = AppState.addEventListener('change', (value) =>
        update(value === 'active'),
      );
      return () => {
        subscription.remove();
        flow.setForeground(false);
        setForeground(false);
      };
    }, [flow]),
  );
  useEffect(() => {
    const current = navigationSession.getSnapshot();
    if (
      navigationOwner(current) !== owner ||
      current.ownerVersion !== generation
    )
      return;
    if (state.payment)
      queryClient.setQueryData(
        ['payment', owner, detail.request_id],
        state.payment,
      );
    if (state.detail)
      queryClient.setQueryData(
        ['collection', owner, detail.request_id],
        state.detail,
      );
  }, [
    state.payment,
    state.detail,
    owner,
    generation,
    detail.request_id,
    queryClient,
  ]);
  const pay = useMutation({
    mutationFn: () => flow.start(),
    onSuccess: () => {
      const current = navigationSession.getSnapshot();
      if (
        navigationOwner(current) === owner &&
        current.ownerVersion === generation
      )
        return invalidateCollection(queryClient, owner, detail.request_id);
    },
    retry: false,
  });
  const payment = useQuery({
    queryKey: ['payment', owner, detail.request_id],
    queryFn: () => flow.refresh(),
    initialData: detail.payment,
    enabled: foreground,
    initialDataUpdatedAt: queryClient.getQueryState([
      'collection',
      owner,
      detail.request_id,
    ])?.dataUpdatedAt,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const refunds = useQuery({
    queryKey: ['refunds', owner, detail.request_id],
    queryFn: ({ signal }) => repositories.refunds(detail.request_id, signal),
    initialData: { refunds: detail.refunds },
    initialDataUpdatedAt: queryClient.getQueryState([
      'collection',
      owner,
      detail.request_id,
    ])?.dataUpdatedAt,
    enabled:
      foreground && (detail.status === 'CANCELLED' || !!detail.refunds.length),
    refetchInterval: (query) =>
      query.state.data?.refunds.some((refund) =>
        ['INITIATED', 'PROCESSING', 'CONFIRMING'].includes(refund.status),
      )
        ? 20000
        : false,
  });
  const currentPayment = payment.data ?? detail.payment;
  const currentRefunds = refunds.data?.refunds ?? detail.refunds;
  const checkoutMoney =
    currentPayment.amount_minor > 0 && currentPayment.currency === 'INR';
  const canPrepare =
    detail.status === 'PENDING_PAYMENT' &&
    currentPayment.status !== 'SUCCEEDED' &&
    currentPayment.action_reason !== 'UNKNOWN' &&
    checkoutMoney &&
    (currentPayment.action === 'WAIT' ||
      (currentPayment.retry_allowed &&
        ['START', 'RESUME'].includes(currentPayment.action)));
  const unavailable =
    !nativeAllowed || !checkout || checkout.available?.() === false;
  const refreshPayment = () => {
    pay.reset();
    void flow.refresh(true).catch(() => {});
  };
  const awaiting =
    currentPayment.status !== 'SUCCEEDED' &&
    (currentPayment.verification_pending ||
      currentPayment.action === 'WAIT' ||
      ['PROCESSING', 'CONFIRMING'].includes(currentPayment.status) ||
      state.phase === 'awaiting');
  return (
    <View style={{ gap: 16 }}>
      <Card>
        <Heading style={{ fontSize: 27 }}>Payment</Heading>
        <Body style={{ color: '#111111' }}>
          {moneyLabel(currentPayment.amount_minor, currentPayment.currency)}
        </Body>
        <Body accessibilityLiveRegion="polite">
          {currentPayment.status === 'SUCCEEDED'
            ? 'Payment received'
            : state.phase === 'preparing' || state.phase === 'checkout'
              ? 'Payment processing'
              : awaiting
                ? 'Payment awaiting confirmation'
                : currentPayment.action === 'UNAVAILABLE'
                  ? 'Payment unavailable or expired'
                  : paymentLabel(currentPayment.status)}
        </Body>
        {payment.isPending && <Skeleton height={36} />}
        {!checkoutMoney && currentPayment.status !== 'SUCCEEDED' && (
          <Body>
            Secure checkout is unavailable for this amount or currency. Refresh
            the details or contact Help &amp; Support.
          </Body>
        )}
        {(payment.isError || state.error) && (
          <StatusCard
            title="Unable to refresh payment"
            error={state.error ?? payment.error}
            retry={refreshPayment}
          />
        )}
        {awaiting && (
          <Body>
            We’re checking the payment with Tirodhan. Closing checkout or
            returning from your bank does not confirm payment.
          </Body>
        )}
        {currentPayment.action_reason === 'ACCOUNT_MISMATCH' && (
          <Body>
            Secure payment is unavailable for this booking. Refresh its details
            or contact Help &amp; Support.
          </Body>
        )}
        {currentPayment.action_reason === 'RECONCILIATION_REQUIRED' && (
          <Body>
            Tirodhan is verifying the existing payment. Please do not create
            another pickup to retry this payment.
          </Body>
        )}
        {state.verificationStopped && awaiting && (
          <Body>
            Automatic checking has stopped. Payment is still awaiting
            confirmation. Refresh the status when you are ready.
          </Body>
        )}
        {canPrepare && (
          <>
            <Button
              label={
                currentPayment.action === 'WAIT'
                  ? 'Verify and continue payment'
                  : currentPayment.action === 'RESUME' ||
                      currentPayment.status === 'FAILED'
                    ? 'Retry secure payment'
                    : 'Pay securely'
              }
              disabled={!foreground || unavailable || state.nativeOutstanding}
              busy={state.busy || pay.isPending}
              onPress={() => pay.mutate()}
            />
            {currentPayment.action === 'RESUME' && (
              <Body>
                Tirodhan permits another checkout using the existing payment
                Order.
              </Body>
            )}
            {state.nativeOutstanding && (
              <Body>
                Checkout may still be open. Return from your payment app and
                refresh the status. This does not confirm payment.
              </Body>
            )}
            {unavailable && !state.nativeOutstanding && (
              <Body>
                {previewCatalogue
                  ? 'Development preview: provider checkout is not connected.'
                  : 'Secure checkout is unavailable. Use the Tirodhan development build, or return to any checkout already open.'}
              </Body>
            )}
          </>
        )}
        {pay.isError && (
          <StatusCard
            title="Unable to continue payment"
            error={pay.error}
            retry={refreshPayment}
          />
        )}
        <Button
          secondary
          label="Refresh payment status"
          onPress={refreshPayment}
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
