import * as Notifications from 'expo-notifications';
import { isRunningInExpoGo } from 'expo';
import { queryClient, pushLifecycle } from '../lib/runtime';
import {
  enableNotifications,
  installNotifications,
  hasDeviceToken,
  clearNotificationCredential,
  permissionState,
} from '../notifications/integration';
jest.mock('expo', () => ({ isRunningInExpoGo: jest.fn(() => false) }));
jest.mock('../lib/runtime', () => ({
  queryClient: { invalidateQueries: jest.fn().mockResolvedValue(undefined) },
  session: { getSnapshot: () => ({ userId: 'customer' }) },
  pushLifecycle: { register: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ granted: false, status: 'undetermined' }),
  requestPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ granted: true, status: 'granted' }),
  getDevicePushTokenAsync: jest
    .fn()
    .mockResolvedValue({ type: 'ios', data: 'native-token' }),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({
    remove: jest.fn(),
  })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  clearLastNotificationResponseAsync: jest.fn(),
}));
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(isRunningInExpoGo).mockReturnValue(false);
  clearNotificationCredential();
});

test('Expo Go never requests permission, acquires or registers host push tokens', async () => {
  jest.mocked(isRunningInExpoGo).mockReturnValue(true);
  expect(await permissionState()).toEqual({
    status: 'unavailable',
    granted: false,
  });
  expect(await enableNotifications()).toEqual({ status: 'unavailable' });
  const cleanup = installNotifications(jest.fn());
  cleanup();
  expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
  expect(Notifications.setNotificationHandler).not.toHaveBeenCalled();
  expect(Notifications.addNotificationReceivedListener).not.toHaveBeenCalled();
  expect(
    Notifications.addNotificationResponseReceivedListener,
  ).not.toHaveBeenCalled();
  expect(Notifications.addPushTokenListener).not.toHaveBeenCalled();
  expect(Notifications.getLastNotificationResponseAsync).not.toHaveBeenCalled();
  expect(pushLifecycle.register).not.toHaveBeenCalled();
  expect(hasDeviceToken()).toBe(false);
});
test('install does not request permission and unsubscribes all native listeners', () => {
  const cleanup = installNotifications(jest.fn());
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  cleanup();
  expect(
    jest.mocked(Notifications.addNotificationReceivedListener).mock.results[0]!
      .value.remove,
  ).toHaveBeenCalled();
  expect(
    jest.mocked(Notifications.addNotificationResponseReceivedListener).mock
      .results[0]!.value.remove,
  ).toHaveBeenCalled();
  expect(
    jest.mocked(Notifications.addPushTokenListener).mock.results[0]!.value
      .remove,
  ).toHaveBeenCalled();
});
test('user opt-in acquires native device token only after permission grant', async () => {
  await enableNotifications();
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.getDevicePushTokenAsync).toHaveBeenCalledTimes(1);
  expect(hasDeviceToken()).toBe(true);
  expect(pushLifecycle.register).toHaveBeenCalledWith('IOS', 'native-token');
});

test('release keeps native push behavior even if Expo Go detection returns true', async () => {
  jest.mocked(isRunningInExpoGo).mockReturnValue(true);
  const development = jest.replaceProperty(
    globalThis as typeof globalThis & { __DEV__: boolean },
    '__DEV__',
    false,
  );
  try {
    await enableNotifications();
    expect(Notifications.getDevicePushTokenAsync).toHaveBeenCalledTimes(1);
    expect(pushLifecycle.register).toHaveBeenCalledWith('IOS', 'native-token');
  } finally {
    development.restore();
  }
});
test('rotation retains latest native token only in memory and cleanup clears it', () => {
  const cleanup = installNotifications(jest.fn());
  jest
    .mocked(Notifications.addPushTokenListener)
    .mock.calls[0]![0]({ type: 'ios', data: 'rotated' });
  expect(hasDeviceToken()).toBe(true);
  cleanup();
  expect(hasDeviceToken()).toBe(false);
});
test('native foreground/tap listeners refetch and never consume business state', () => {
  const navigate = jest.fn();
  const cleanup = installNotifications(navigate);
  const notification: Notifications.Notification = {
    date: 0,
    request: {
      identifier: 'duplicate',
      trigger: null,
      content: {
        title: null,
        subtitle: null,
        body: null,
        sound: null,
        categoryIdentifier: null,
        data: { status: 'COMPLETED' },
      },
    },
  };
  jest
    .mocked(Notifications.addNotificationReceivedListener)
    .mock.calls[0]![0](notification);
  const tap = jest.mocked(Notifications.addNotificationResponseReceivedListener)
    .mock.calls[0]![0];
  const response = { notification } as Notifications.NotificationResponse;
  tap(response);
  tap(response);
  expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(6);
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith('/activity');
  cleanup();
});
