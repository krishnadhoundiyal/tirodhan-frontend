import { useSyncExternalStore } from 'react';
import { preview, pushNotifications } from '../runtime';
import { Body, Button, Card, Muted } from '../ui';
import { nativePushAvailable } from './native';
import type { PushStatus } from './lifecycle';
const messages: Record<PushStatus, string> = {
  idle: 'Enable notifications to receive work updates. Explicit Refresh remains available.',
  unavailable:
    'Notifications are not configured for this installation. Use Refresh and contact Operations.',
  permission:
    'Notification permission is not enabled. Other Rider features remain available.',
  denied:
    'Notification permission was denied. You can change it in device settings; Refresh remains available.',
  registered:
    'Work notifications are enabled. Updates refresh the current assignment and route; work actions remain yours.',
  retry:
    'Notification setup or cleanup could not be confirmed. Retry when connected. Refresh remains available.',
  revoking: 'Turning off notifications for this Rider account.',
};
export default function NotificationCard() {
  const state = useSyncExternalStore(
    pushNotifications.subscribe,
    pushNotifications.getSnapshot,
    pushNotifications.getSnapshot,
  );
  const available = !preview && nativePushAvailable();
  return (
    <Card>
      <Body>
        {available ? 'Work notifications' : 'Notifications unavailable'}
      </Body>
      <Muted>
        {preview
          ? 'SCREEN_PREVIEW uses no Firebase token, native messaging or push registration.'
          : messages[available ? state : 'unavailable']}
      </Muted>
      {available && (
        <Button
          title={
            state === 'registered'
              ? 'Reconcile notification registration'
              : 'Enable or retry notifications'
          }
          disabled={state === 'revoking'}
          onPress={() => void pushNotifications.reconcile(true, true)}
        />
      )}
    </Card>
  );
}
