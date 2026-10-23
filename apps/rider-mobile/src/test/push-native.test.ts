let mockOS = 'android',
  mockMode = 'LIVE',
  mockGo = false;
let mockConfiguration = { android: true, ios: true };
const mockLoad = jest.fn();
const mockSdk = {
  getMessaging: jest.fn(() => ({})),
  getToken: jest.fn(async () => 'native-fcm-token'),
  getAPNSToken: jest.fn(),
  setAutoInitEnabled: jest.fn(async () => {}),
  deleteToken: jest.fn(async () => {}),
  isDeviceRegisteredForRemoteMessages: jest.fn(() => false),
  registerDeviceForRemoteMessages: jest.fn(async () => {}),
  hasPermission: jest.fn(async () => 1),
  requestPermission: jest.fn(async () => 1),
  AuthorizationStatus: {
    AUTHORIZED: 1,
    PROVISIONAL: 2,
    NOT_DETERMINED: -1,
    DENIED: 0,
  },
  onTokenRefresh: jest.fn(() => jest.fn()),
  onMessage: jest.fn((_m: unknown, _cb: (message: { data: unknown }) => void) =>
    jest.fn(),
  ),
  onNotificationOpenedApp: jest.fn(
    (_m: unknown, _cb: (message: { data: unknown }) => void) => jest.fn(),
  ),
  getInitialNotification: jest.fn(async () => ({
    data: { type: 'ROUTE_REVISION', revision_id: 'revision' },
  })),
  setBackgroundMessageHandler: jest.fn(
    (
      _m: unknown,
      _handler: (message: { data: unknown }) => Promise<void>,
    ) => {},
  ),
};
const mockCheck = jest.fn(async () => true),
  mockRequest = jest.fn(async () => 'granted');
jest.mock('@react-native-firebase/messaging', () => {
  mockLoad();
  return mockSdk;
});
jest.mock('expo-constants', () => ({
  __esModule: true,
  ExecutionEnvironment: { StoreClient: 'storeClient' },
  default: {
    get executionEnvironment() {
      return mockGo ? 'storeClient' : 'standalone';
    },
    get expoConfig() {
      return { extra: { riderPush: mockConfiguration } };
    },
  },
}));
jest.mock('expo', () => ({ isRunningInExpoGo: () => mockGo }));
jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockOS;
    },
    Version: 36,
  },
  PermissionsAndroid: {
    PERMISSIONS: { POST_NOTIFICATIONS: 'notifications' },
    RESULTS: { GRANTED: 'granted' },
    check: mockCheck,
    request: mockRequest,
  },
}));
let native: typeof import('../notifications/native');
let bootstrap: typeof import('../notifications/bootstrap');
const previousMode = process.env.EXPO_PUBLIC_RIDER_MODE;
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: jest
      .fn()
      .mockRejectedValue(new Error('No native-boundary HTTP expected')),
  });
  mockOS = 'android';
  mockMode = 'LIVE';
  mockGo = false;
  mockConfiguration = { android: true, ios: true };
  mockCheck.mockResolvedValue(true);
  mockRequest.mockResolvedValue('granted');
  mockSdk.hasPermission.mockResolvedValue(1);
  mockSdk.requestPermission.mockResolvedValue(1);
});
afterEach(() => {
  if (previousMode === undefined) delete process.env.EXPO_PUBLIC_RIDER_MODE;
  else process.env.EXPO_PUBLIC_RIDER_MODE = previousMode;
});
function load() {
  process.env.EXPO_PUBLIC_RIDER_MODE = mockMode;
  jest.isolateModules(() => {
    native = jest.requireActual('../notifications/native');
    bootstrap = jest.requireActual('../notifications/bootstrap');
  });
}
test.each(['preview', 'web', 'go', 'missing'] as const)(
  '%s bootstrap never initializes native Firebase or acquires a token',
  (kind) => {
    if (kind === 'preview') mockMode = 'SCREEN_PREVIEW';
    if (kind === 'web') mockOS = 'web';
    if (kind === 'go') mockGo = true;
    if (kind === 'missing') mockConfiguration = { android: false, ios: false };
    load();
    bootstrap.installBackgroundNotifications();
    expect(native.loadNativePush()).toBeNull();
    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockSdk.getMessaging).not.toHaveBeenCalled();
    expect(mockSdk.getToken).not.toHaveBeenCalled();
  },
);
test('configured background handler decodes hints without permission, tokens, session or network', async () => {
  const fetcher = globalThis.fetch;
  load();
  bootstrap.installBackgroundNotifications();
  const handler = mockSdk.setBackgroundMessageHandler.mock.calls[0]![1];
  await handler({
    data: {
      type: 'ASSIGNMENT_OFFER',
      collection_group_id: 'group',
      offer_round: '1',
    },
  });
  await handler({ data: { type: 'UNKNOWN' } });
  expect(mockSdk.getToken).not.toHaveBeenCalled();
  expect(mockSdk.requestPermission).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});
test('Android permission requires an explicit request and denied permission is respected', async () => {
  load();
  const port = native.loadNativePush()!;
  mockCheck.mockResolvedValue(false);
  mockRequest.mockResolvedValue('denied');
  expect(await port.permission(false)).toBe('undetermined');
  expect(mockRequest).not.toHaveBeenCalled();
  expect(await port.permission(true)).toBe('denied');
  expect(mockRequest).toHaveBeenCalledWith('notifications');
  expect(mockSdk.getToken).not.toHaveBeenCalled();
});
test('iOS acquires an FCM token after remote-message registration and never returns the raw APNs token', async () => {
  mockOS = 'ios';
  load();
  const port = native.loadNativePush()!;
  expect(await port.permission(true)).toBe('granted');
  expect(await port.token()).toBe('native-fcm-token');
  expect(mockSdk.registerDeviceForRemoteMessages).toHaveBeenCalledTimes(1);
  expect(mockSdk.getAPNSToken).not.toHaveBeenCalled();
  await port.reset();
  expect(mockSdk.setAutoInitEnabled).toHaveBeenLastCalledWith(
    expect.anything(),
    false,
  );
  expect(mockSdk.deleteToken).toHaveBeenCalledTimes(1);
});
test.each([0, -1, 2])(
  'iOS permission status %s is mapped without inventing authorization',
  async (value) => {
    mockOS = 'ios';
    mockSdk.hasPermission.mockResolvedValue(value);
    load();
    expect(await native.loadNativePush()!.permission(false)).toBe(
      value === 2 ? 'granted' : value === 0 ? 'denied' : 'undetermined',
    );
    expect(mockSdk.getToken).not.toHaveBeenCalled();
  },
);
test('foreground, open and initial SDK callbacks expose only payload data to refresh decoding', async () => {
  load();
  const port = native.loadNativePush()!,
    received = jest.fn(),
    opened = jest.fn();
  port.received(received);
  port.opened(opened);
  const data = { type: 'ROUTE_REVISION', revision_id: 'revision' };
  mockSdk.onMessage.mock.calls[0]![1]({ data });
  mockSdk.onNotificationOpenedApp.mock.calls[0]![1]({ data });
  expect(received).toHaveBeenCalledWith(data);
  expect(opened).toHaveBeenCalledWith(data);
  expect(await port.initial()).toEqual(data);
});
