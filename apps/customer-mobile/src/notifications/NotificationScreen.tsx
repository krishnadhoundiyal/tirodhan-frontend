import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import { Body, Button, Card, Heading, styles } from '../components/ui';
import { enableNotifications, permissionState } from './integration';
export default function NotificationScreen() {
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
          <Button
            label="Enable notifications"
            onPress={() => void enable()}
            busy={busy}
          />
          {error && <Body accessibilityRole="alert">{error}</Body>}
        </Card>
        <Body>
          Collection updates are not available yet. We’ll show them here when
          the service is ready.
        </Body>
      </ScrollView>
    </SafeAreaView>
  );
}
