import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Tirodhan Rider',
  slug: 'tirodhan-rider',
  version: '1.0.0',
  scheme: 'tirodhan-rider',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: { bundleIdentifier: 'com.tirodhan.rider', supportsTablet: false },
  android: { package: 'com.tirodhan.rider' },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-secure-store',
    'expo-font',
    ['expo-splash-screen', { backgroundColor: '#F8F5EF' }],
  ],
};
export default config;
