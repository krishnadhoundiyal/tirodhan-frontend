import { useEffect, useState, useSyncExternalStore } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import {
  Body,
  Button,
  Card,
  Heading,
  StatusCard,
  styles,
} from '../components/ui';
import { enableNotifications, permissionState } from './integration';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { repositories } from '../lib/repositories';
import { pushLifecycle } from '../lib/runtime';
import { useCustomerOwner } from '../features/collection/queries';
import { isExpiredCursor } from '../api/errors';
export default function NotificationScreen() {
  const owner = useCustomerOwner();
  const queryClient = useQueryClient();
  const registration = useSyncExternalStore(
    pushLifecycle.subscribe,
    pushLifecycle.state,
  );
  const history = useInfiniteQuery({
    queryKey: ['notifications', owner],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      repositories.notifications(pageParam, signal),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  useEffect(() => {
    if (history.isFetchNextPageError && isExpiredCursor(history.error))
      void queryClient.resetQueries({
        queryKey: ['notifications', owner],
        exact: true,
      });
  }, [queryClient, history.error, history.isFetchNextPageError, owner]);
  const [permission, setPermission] = useState('Checking…');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    void permissionState()
      .then((result) => setPermission(result.status))
      .catch(() => setPermission('Unavailable'));
  }, []);
  const enable = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await enableNotifications();
      setPermission(result.status);
    } catch {
      setError(
        'Notifications could not be enabled. Please try again on your device.',
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <Header back address={false} />
      <ScrollView contentContainerStyle={styles.content}>
        <Heading>Notifications</Heading>
        <Card>
          <Heading style={{ fontSize: 24 }}>
            Stay close to your collection
          </Heading>
          <Body>
            Receive updates on your sacred items. Your latest journey will
            always be available in Activity when the service is ready.
          </Body>
          <Body>Permission: {permission}</Body>
          <Body>
            Registration:{' '}
            {registration === 'registered'
              ? 'Registered for collection signals'
              : registration === 'backendPending'
                ? 'Customer registration is awaiting backend support'
                : registration === 'failed'
                  ? 'Registration could not be confirmed'
                  : 'Not registered'}
          </Body>
          <Button
            label="Enable notifications"
            onPress={() => void enable()}
            busy={busy}
          />
          {error && <Body accessibilityRole="alert">{error}</Body>}
        </Card>
        <Button
          secondary
          label="Manage update preferences"
          onPress={() => router.push('/account-options?section=preferences')}
        />
        <Heading style={{ fontSize: 26 }}>Collection updates</Heading>
        {history.isError && (
          <StatusCard
            title="Updates unavailable"
            error={history.error}
            retry={() =>
              void (history.isFetchNextPageError
                ? history.fetchNextPage()
                : history.refetch())
            }
          />
        )}
        {history.data?.pages
          .flatMap((page) => page.items)
          .map((entry) => (
            <Card key={entry.event_id}>
              <Heading style={{ fontSize: 24 }}>{entry.title}</Heading>
              <Body>{entry.body}</Body>
              <Body>{new Date(entry.created_at).toLocaleString()}</Body>
              <Button
                secondary
                label="Open collection"
                onPress={() =>
                  router.push({
                    pathname: '/collections/[requestId]',
                    params: { requestId: entry.request_id },
                  })
                }
              />
            </Card>
          ))}
        {history.data &&
          !history.data.pages.some((page) => page.items.length) && (
            <Body>No collection updates yet.</Body>
          )}
        {history.hasNextPage && (
          <Button
            secondary
            label="Load more updates"
            busy={history.isFetchingNextPage}
            onPress={() => void history.fetchNextPage()}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
