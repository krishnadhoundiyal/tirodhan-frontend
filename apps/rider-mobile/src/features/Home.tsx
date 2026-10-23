import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRiderResource } from '../hooks';
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
import { pushRegistrationStatus } from '../notifications/signals';
export default function Home() {
  const { query, operations } = useRiderResource('availability');
  const router = useRouter();
  const change = useMutation({
    mutationFn: (intent: 'AVAILABLE' | 'OFFLINE') =>
      operations.setAvailability(intent, query.data!.version),
  });
  const state = query.data;
  return (
    <Page title="Rider Home">
      <Body>
        Set your availability and review the work assigned by Tirodhan.
      </Body>
      {query.isPending && <Loading />}
      <ErrorState error={query.error || change.error} />
      {state && (
        <Card>
          <Body>Availability intent: {state.availability_intent}</Body>
          <Body>Work state: {state.work_state}</Body>
          <Muted>
            Version {state.version} · Updated {dateLabel(state.updated_at)}
          </Muted>
          <Muted>
            Availability is your intent. Work state is managed separately by the
            service.
          </Muted>
          {(['AVAILABLE', 'OFFLINE'] as const).map((intent) => (
            <Button
              key={intent}
              title={
                intent === 'AVAILABLE' ? 'Request available' : 'Request offline'
              }
              disabled={
                change.isPending ||
                query.isFetching ||
                query.isError ||
                state.availability_intent === intent
              }
              onPress={() => change.mutate(intent)}
            />
          ))}
        </Card>
      )}
      <Button
        title={query.isFetching ? 'Refreshing…' : 'Refresh current work'}
        disabled={query.isFetching || change.isPending}
        onPress={() => void operations.refresh().catch(() => {})}
      />
      <Button
        title="View assignment offers"
        onPress={() => router.push('/(rider)/offers')}
      />
      <Button
        title="View active assignment"
        onPress={() => router.push('/(rider)/assignment')}
      />
      <Card>
        <Body>Notifications unavailable</Body>
        <Muted>{pushRegistrationStatus.message}</Muted>
      </Card>
    </Page>
  );
}
