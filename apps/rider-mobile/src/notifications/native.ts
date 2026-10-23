import Constants, { ExecutionEnvironment } from 'expo-constants';
import { PermissionsAndroid, Platform } from 'react-native';
import type { NativePush } from './contracts';
import { riderMode } from '../configuration';
import loadMessaging from './native-sdk';
let cached: NativePush | null = null;
export function nativePushAvailable() {
  if (
    riderMode(__DEV__, process.env.EXPO_PUBLIC_RIDER_MODE) ===
      'SCREEN_PREVIEW' ||
    Platform.OS === 'web' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  )
    return false;
  const settings = Constants.expoConfig?.extra?.riderPush;
  return (
    (Platform.OS === 'android' && settings?.android === true) ||
    (Platform.OS === 'ios' && settings?.ios === true)
  );
}
export function loadNativePush(): NativePush | null {
  if (!nativePushAvailable()) return null;
  if (cached) return cached;
  // No native Firebase import/getMessaging occurs in fixtures, web, Expo Go or unconfigured builds.
  const sdk = loadMessaging();
  const messaging = sdk.getMessaging();
  cached = {
    platform: Platform.OS === 'android' ? 'ANDROID' : 'IOS',
    permission: async (request) => {
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
        if (await PermissionsAndroid.check(permission)) return 'granted';
        if (!request) return 'undetermined';
        return (await PermissionsAndroid.request(permission)) ===
          PermissionsAndroid.RESULTS.GRANTED
          ? 'granted'
          : 'denied';
      }
      if (Platform.OS === 'android')
        return (await sdk.hasPermission(messaging)) ===
          sdk.AuthorizationStatus.AUTHORIZED
          ? 'granted'
          : 'denied';
      const value = await (request
        ? sdk.requestPermission(messaging, {
            alert: true,
            badge: true,
            sound: true,
          })
        : sdk.hasPermission(messaging));
      return value === sdk.AuthorizationStatus.AUTHORIZED ||
        value === sdk.AuthorizationStatus.PROVISIONAL
        ? 'granted'
        : value === sdk.AuthorizationStatus.NOT_DETERMINED
          ? 'undetermined'
          : 'denied';
    },
    token: async () => {
      await sdk.setAutoInitEnabled(messaging, true);
      if (
        Platform.OS === 'ios' &&
        !sdk.isDeviceRegisteredForRemoteMessages(messaging)
      )
        await sdk.registerDeviceForRemoteMessages(messaging);
      return sdk.getToken(messaging); // FCM on both platforms; never getAPNSToken or an Expo token.
    },
    reset: async () => {
      await sdk.setAutoInitEnabled(messaging, false);
      await sdk.deleteToken(messaging);
    },
    tokenChanged: (callback) => sdk.onTokenRefresh(messaging, callback),
    received: (callback) =>
      sdk.onMessage(messaging, (message) => callback(message.data)),
    opened: (callback) =>
      sdk.onNotificationOpenedApp(messaging, (message) =>
        callback(message.data),
      ),
    initial: async () =>
      (await sdk.getInitialNotification(messaging))?.data ?? null,
    background: (callback) =>
      sdk.setBackgroundMessageHandler(messaging, (message) =>
        callback(message.data),
      ),
  };
  return cached;
}
