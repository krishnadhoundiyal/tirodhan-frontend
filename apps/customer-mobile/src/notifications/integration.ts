import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { queryClient, session, pushLifecycle } from '../lib/runtime';
import {
  notificationDispatcher,
  type NotificationDestination,
} from './signals';
import { notificationCredential } from './credential';
export async function permissionState() {
  return Platform.OS === 'web'
    ? { status: 'unavailable', granted: false }
    : Notifications.getPermissionsAsync();
}
async function acceptToken(
  token: Notifications.DevicePushToken,
  generation: number,
) {
  if (generation !== notificationCredential.generation()) return;
  notificationCredential.set(token, generation);
  if (
    typeof token.data === 'string' &&
    (Platform.OS === 'android' || Platform.OS === 'ios')
  )
    await pushLifecycle.register(
      Platform.OS === 'android' ? 'ANDROID' : 'IOS',
      token.data,
    );
}
export async function enableNotifications() {
  const generation = notificationCredential.generation();
  if (Platform.OS === 'web' || !Device.isDevice)
    return { status: 'unavailable' as const };
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('collection-updates', {
      name: 'Collection updates',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  const existing = await Notifications.getPermissionsAsync(),
    result = existing.granted
      ? existing
      : await Notifications.requestPermissionsAsync();
  if (result.granted)
    await acceptToken(
      await Notifications.getDevicePushTokenAsync(),
      generation,
    );
  return result;
}
export function clearNotificationCredential() {
  notificationCredential.clear();
}
export function installNotifications(
  navigate: (route: NotificationDestination) => void,
) {
  if (Platform.OS === 'web') return () => {};
  const generation = notificationCredential.generation();
  const refetch = (id?: string) => {
    const owner = session.getSnapshot().userId;
    void queryClient.invalidateQueries({ queryKey: ['collections', owner] });
    void queryClient.invalidateQueries({ queryKey: ['notifications', owner] });
    if (id)
      for (const key of ['collection', 'payment', 'refunds'])
        void queryClient.invalidateQueries({ queryKey: [key, owner, id] });
  };
  const dispatcher = notificationDispatcher(refetch, navigate);
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  const received = Notifications.addNotificationReceivedListener(
    ({ request }) =>
      dispatcher.foreground({
        identifier: request.identifier,
        data: request.content.data,
      }),
  );
  const tap = (response: Notifications.NotificationResponse) => {
    const { request } = response.notification;
    dispatcher.tap({
      identifier: request.identifier,
      data: request.content.data,
    });
  };
  const responseListener =
    Notifications.addNotificationResponseReceivedListener(tap);
  const rotation = Notifications.addPushTokenListener((token) => {
    void acceptToken(token, generation);
  });
  let disposed = false;
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (!disposed && response) {
        tap(response);
        void Notifications.clearLastNotificationResponseAsync();
      }
    })
    .catch(() => {});
  void Notifications.getPermissionsAsync()
    .then(async (permission) => {
      if (!disposed && permission.granted && Device.isDevice) {
        const token = await Notifications.getDevicePushTokenAsync();
        if (!disposed) await acceptToken(token, generation);
      }
    })
    .catch(() => {});
  return () => {
    disposed = true;
    received.remove();
    responseListener.remove();
    rotation.remove();
    dispatcher.reset();
    clearNotificationCredential();
  };
}
export function hasDeviceToken() {
  return notificationCredential.has();
}
