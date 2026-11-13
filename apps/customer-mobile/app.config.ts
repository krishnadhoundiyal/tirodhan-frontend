import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Tirodhan',
  slug: 'tirodhan-customer',
  owner: 'tirodhan',
  extra: { eas: { projectId: '265eed10-2b38-4186-a150-10831653ab7e' } },
  version: '1.0.0',
  scheme: 'tirodhan',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: { bundleIdentifier: 'com.tirodhan.customer', supportsTablet: false },
  android: {
    package: 'com.tirodhan.customer',
    ...(process.env.GOOGLE_SERVICES_FILE
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_FILE }
      : {}),
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-secure-store',
    'expo-font',
    ['expo-splash-screen', { backgroundColor: '#F8F5EF' }],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Use your location to choose a pickup address.',
      },
    ],
    [
      'expo-notifications',
      { color: '#C58A3A', defaultChannel: 'collection-updates' },
    ],
    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '',
      },
    ],
  ],
  experiments: { typedRoutes: true },
};
export default config;
