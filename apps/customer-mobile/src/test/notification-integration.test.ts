import * as Notifications from 'expo-notifications';
import { queryClient } from '../lib/runtime';
import {
  enableNotifications,
  installNotifications,
  hasDeviceToken,
  clearNotificationCredential,
} from '../notifications/integration';
jest.mock('../lib/runtime', () => ({
  queryClient: { invalidateQueries: jest.fn().mockResolvedValue(undefined) },
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
  clearNotificationCredential();
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
  expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(3);
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith('/activity');
  cleanup();
});
