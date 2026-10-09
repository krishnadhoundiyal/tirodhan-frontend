import { useState } from 'react';
import { ScrollView, View, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { Header } from '../../components/Header';
import { ActionModal } from '../../components/ActionModal';
import {
  Body,
  Button,
  Card,
  Heading,
  Skeleton,
  StatusCard,
  styles,
} from '../../components/ui';
import { userMessage } from '../../api/errors';
import { useCatalogue, useCollectionDetail } from './queries';
import {
  ambiguousCancellation,
  cancellationMessage,
  useCancellation,
} from './cancellation';
import FinancialSection from './FinancialSection';
import JourneyTimeline from '../activity/JourneyTimeline';
import { moneyLabel } from './financial';
import { previewCatalogue, hasCustomerCapability } from '../../lib/runtime';
import type { CollectionDetail } from '../../api/customer-contracts';

function DetailContent({
  detail,
  refetch,
}: {
  detail: CollectionDetail;
  refetch(): void;
}) {
  const [confirm, setConfirm] = useState(false);
  const cancel = useCancellation(detail.request_id, detail.cancellation);
  const catalogue = useCatalogue();
  const canCancel =
    detail.cancellation.allowed &&
    hasCustomerCapability('cancellationCompensation');
  return (
    <View style={{ gap: 16 }}>
      <Card>
        <Heading style={{ fontSize: 28 }}>{detail.title}</Heading>
        <Body accessibilityLiveRegion="polite">
          {detail.status === 'CANCELLED'
            ? 'Pickup cancelled'
            : detail.status.replaceAll('_', ' ').toLowerCase()}
        </Body>
        <Body>{detail.slot.label}</Body>
        <Body>{detail.address.text}</Body>
      </Card>
      {(cancel.isSuccess || detail.status === 'CANCELLED') && (
        <StatusCard
          title="Pickup cancelled"
          detail={
            previewCatalogue
              ? 'Development cancellation result. No cancellation or refund was sent to Tirodhan. Refund progress is shown separately below.'
              : 'Your pickup has been cancelled. Refund progress is shown separately below.'
          }
        />
      )}
      <Card>
        <Heading style={{ fontSize: 26 }}>Collection items</Heading>
        {detail.items.map((item) => (
          <View key={item.category_code} style={{ gap: 3, paddingVertical: 6 }}>
            <Body style={{ color: '#111111' }}>{item.display_name}</Body>
            {item.declared_quantity !== null && (
              <Body>Declared quantity: {item.declared_quantity}</Body>
            )}
            {item.declared_weight_grams !== null && (
              <Body>Declared weight: {item.declared_weight_grams} g</Body>
            )}
            <Body>
              {moneyLabel(item.quoted_line_amount_minor, detail.quote.currency)}
            </Body>
          </View>
        ))}
        <Body>
          Collection total ·{' '}
          {moneyLabel(detail.quote.amount_minor, detail.quote.currency)}
        </Body>
      </Card>
      <Card>
        <JourneyTimeline
          journey={detail.journey}
          artwork={catalogue.data?.artwork}
        />
      </Card>
      <FinancialSection detail={detail} />
      {canCancel && detail.status !== 'CANCELLED' && (
        <Button
          secondary
          label="Cancel pickup"
          onPress={() => setConfirm(true)}
        />
      )}
      {!detail.cancellation.allowed && detail.status !== 'CANCELLED' && (
        <Body>
          {detail.cancellation.reason === 'PLANNING_CUTOFF_REACHED' ||
          detail.cancellation.reason === 'PLANNING_STARTED'
            ? 'This pickup can no longer be cancelled because planning has already started.'
            : 'Cancellation is not currently available for this pickup.'}
        </Body>
      )}
      <Button secondary label="Refresh pickup details" onPress={refetch} />
      <ActionModal
        visible={confirm && (canCancel || cancel.isSuccess)}
        title="Cancel this pickup?"
        close={() => setConfirm(false)}
        dismissible={!cancel.isPending}
      >
        <Body>{detail.slot.label}</Body>
        <Body>{detail.address.text}</Body>
        <Body>
          {detail.cancellation.refund_expectation === 'FULL_PAYMENT'
            ? `You have paid ${moneyLabel(detail.payment.amount_minor, detail.payment.currency)}. Tirodhan will initiate any required refund after cancellation. Refund completion is tracked separately.`
            : detail.cancellation.refund_expectation === 'REVIEW_REQUIRED'
              ? 'Any refund eligibility will be reviewed by Tirodhan. Cancellation does not confirm a refund.'
              : 'There is no completed payment to refund for this pickup.'}
        </Body>
        {cancel.isError && (
          <Body accessibilityRole="alert">
            {cancellationMessage(cancel.error) ?? userMessage(cancel.error)}
          </Body>
        )}
        {cancel.isSuccess ? (
          <>
            <Body>
              Pickup cancelled. Refund progress will update separately.
            </Body>
            <Button
              label="View cancellation and refund"
              onPress={() => setConfirm(false)}
            />
          </>
        ) : (
          <>
            <Button
              secondary
              label={cancel.isError ? 'Close and check pickup' : 'Keep pickup'}
              disabled={cancel.isPending}
              onPress={() => {
                setConfirm(false);
                if (cancel.isError) refetch();
              }}
            />
            <Button
              label={
                cancel.isError
                  ? 'Retry same cancellation'
                  : 'Confirm cancellation'
              }
              busy={cancel.isPending}
              disabled={
                !canCancel ||
                (!!cancel.error && !ambiguousCancellation(cancel.error))
              }
              onPress={() => cancel.mutate()}
            />
          </>
        )}
      </ActionModal>
    </View>
  );
}
export default function CollectionDetailScreen() {
  const params = useLocalSearchParams<{ requestId: string }>();
  const id = typeof params.requestId === 'string' ? params.requestId : '';
  const query = useCollectionDetail(id);
  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <Header back address={false} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
          />
        }
      >
        <Heading>Collection details</Heading>
        {query.isPending && (
          <>
            <Skeleton height={140} />
            <Skeleton height={230} />
          </>
        )}
        {query.isError && (
          <StatusCard
            title="Unable to load this collection"
            error={query.error}
            retry={() => void query.refetch()}
          />
        )}
        {query.data && (
          <DetailContent
            key={id}
            detail={query.data}
            refetch={() => void query.refetch()}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
