import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRiderResource } from '../hooks';
import { offerActionable } from './operations';
import {
  Body,
  Button,
  Card,
  ErrorState,
  Loading,
  Muted,
  Page,
  dateLabel,
} from '../ui';
export default function Offers() {
  const { query, operations } = useRiderResource('offers');
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  // A single expiry timer changes button eligibility; this performs no network polling.
  useEffect(() => {
    const next = query.data
      ?.map((offer) => Date.parse(offer.expires_at))
      .filter((expiry) => expiry > now)
      .sort((a, b) => a - b)[0];
    if (!next) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(2147483647, Math.max(1, next - Date.now() + 1)),
    );
    return () => clearTimeout(timer);
  }, [query.data, now]);
  const accept = useMutation({
    mutationFn: (id: string) => operations.accept(id),
    onSuccess: () => router.push('/(rider)/assignment'),
  });
  return (
    <Page title="Assignment offers">
      <Body>
        Offers are invitations to accept work. Current availability and
        competing acceptance are checked by the service.
      </Body>
      {query.isPending && <Loading />}
      <ErrorState error={query.error || accept.error} />
      {!query.isPending && !query.error && !query.data?.length && (
        <Card>
          <Body>No actionable offers</Body>
          <Muted>
            There may still be work assigned directly by operations. Check
            Active Assignment.
          </Muted>
        </Card>
      )}
      {query.data?.map((offer) => (
        <Card key={offer.offer_id}>
          <Body>Offer {offer.offer_id}</Body>
          <Muted>
            Group {offer.collection_group_id} · Round {offer.offer_round}
          </Muted>
          <Body>
            Status: {offer.status}
            {Date.parse(offer.expires_at) <= now
              ? ' · Expired locally; refresh to confirm'
              : ''}
          </Body>
          <Muted>Offered {dateLabel(offer.offered_at)}</Muted>
          <Body>Expires {dateLabel(offer.expires_at)}</Body>
          <Button
            title="Accept offer"
            disabled={
              accept.isPending ||
              query.isFetching ||
              query.isError ||
              !offerActionable(offer, now)
            }
            onPress={() => accept.mutate(offer.offer_id)}
          />
        </Card>
      ))}
      <Button
        title="Refresh offers and assignment"
        disabled={query.isFetching || accept.isPending}
        onPress={() => void operations.refresh().catch(() => {})}
      />
      <Muted>
        Refresh on return and manual refresh are available. Native offer
        notifications are not configured yet.
      </Muted>
    </Page>
  );
}
