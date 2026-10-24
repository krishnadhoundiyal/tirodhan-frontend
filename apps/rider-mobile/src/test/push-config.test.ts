const mockPlugins = jest.fn();
let mockFiles = { android: false, ios: false };
jest.mock('../../plugins/firebase-config', () => () => mockFiles);
jest.mock(
  '@react-native-firebase/app/app.plugin',
  () => (config: { mods?: Record<string, Record<string, unknown>> }) => {
    mockPlugins();
    config.mods ??= {};
    config.mods.android ??= {};
    config.mods.ios ??= {};
    config.mods.android.firebase = () => {};
    config.mods.ios.firebase = () => {};
    return config;
  },
);
jest.mock(
  '@react-native-firebase/messaging/app.plugin',
  () => (config: { mods: Record<string, Record<string, unknown>> }) => {
    config.mods.android!.messaging = () => {};
    return config;
  },
);
const withFirebase = jest.requireActual('../../plugins/with-rider-firebase');
beforeEach(() => jest.clearAllMocks());
test('no Firebase configuration applies no native Firebase plugin', () => {
  const original = { mods: { android: {}, ios: {} } };
  expect(withFirebase(original, { android: false, ios: false })).toBe(original);
  expect(mockPlugins).not.toHaveBeenCalled();
});
test.each(['android', 'ios'])(
  'only configured %s receives Firebase mods while preexisting other-platform mods survive',
  (platform) => {
    const base = () => {};
    const result = withFirebase(
      { mods: { android: { base }, ios: { base } } },
      { android: platform === 'android', ios: platform === 'ios' },
    );
    expect(result.mods[platform]).toHaveProperty('firebase');
    const other = platform === 'android' ? 'ios' : 'android';
    expect(result.mods[other]).toEqual({ base });
  },
);

test.each([false, true])(
  'native autolinking excludes unconfigured platforms (Android configured=%s)',
  (android) => {
    mockFiles = { android, ios: false };
    let config: {
      dependencies: Record<
        string,
        { platforms: { android: unknown; ios: unknown } }
      >;
    };
    jest.isolateModules(() => {
      config = jest.requireActual('../../react-native.config');
    });
    for (const dependency of Object.values(config!.dependencies)) {
      expect(dependency.platforms.android).toBe(android ? undefined : null);
      expect(dependency.platforms.ios).toBeNull();
    }
  },
);
