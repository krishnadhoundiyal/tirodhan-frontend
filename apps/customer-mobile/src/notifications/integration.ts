import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { queryClient } from '../lib/runtime';
import { notificationDispatcher } from './signals';

let deviceToken: Notifications.DevicePushToken | null = null;
let tokenGeneration = 0;
export async function permissionState() {
  return Notifications.getPermissionsAsync();
}
export async function enableNotifications() {
  const generation = tokenGeneration;
  if (Platform.OS === 'web' || !Device.isDevice)
    return { status: 'unavailable' as const };
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('collection-updates', {
      name: 'Collection updates',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  const existing = await Notifications.getPermissionsAsync();
  const result = existing.granted
    ? existing
    : await Notifications.requestPermissionsAsync();
  if (result.granted) {
    const token = await Notifications.getDevicePushTokenAsync();
    if (generation === tokenGeneration) deviceToken = token;
  }
  // Android is FCM; iOS is APNs. Never submit APNs to an FCM registration API.
  // No customer registration endpoint currently exists; retain token in memory only.
  return result;
}
export function clearNotificationCredential() {
  ++tokenGeneration;
  deviceToken = null;
}
export function installNotifications(navigate: (route: '/activity') => void) {
  if (Platform.OS === 'web') return () => {};
  const refetch = () => {
    void queryClient.invalidateQueries({ queryKey: ['activity'] });
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
    deviceToken = token;
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
  // Existing permission may be reused without prompting; refresh acquisition after process restart.
  void Notifications.getPermissionsAsync()
    .then(async (permission) => {
      if (!disposed && permission.granted && Device.isDevice) {
        const token = await Notifications.getDevicePushTokenAsync();
        if (!disposed) deviceToken = token;
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
  return deviceToken !== null;
}
