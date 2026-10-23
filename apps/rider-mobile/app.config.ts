import type { ExpoConfig } from 'expo/config';
import firebaseConfiguration from './plugins/firebase-config';

const firebase = firebaseConfiguration();
const apnsEnvironment = process.env.RIDER_APNS_ENVIRONMENT ?? 'development';
if (!['development', 'production'].includes(apnsEnvironment))
  throw new Error('RIDER_APNS_ENVIRONMENT must be development or production');

const config: ExpoConfig = {
  name: 'Tirodhan Rider',
  slug: 'tirodhan-rider',
  version: '1.0.0',
  scheme: 'tirodhan-rider',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'com.tirodhan.rider',
    supportsTablet: false,
    ...(firebase.ios
      ? {
          googleServicesFile: './GoogleService-Info.plist',
          infoPlist: { UIBackgroundModes: ['remote-notification'] },
          entitlements: { 'aps-environment': apnsEnvironment },
        }
      : {}),
  },
  android: {
    package: 'com.tirodhan.rider',
    permissions: ['android.permission.POST_NOTIFICATIONS'],
    ...(firebase.android
      ? { googleServicesFile: './google-services.json' }
      : {}),
  },
  extra: { riderPush: firebase },
  plugins: [
    ['./plugins/with-rider-firebase', firebase],
    [
      'expo-build-properties',
      { ios: firebase.ios ? { useFrameworks: 'dynamic' } : {} },
    ],
    'expo-router',
    'expo-dev-client',
    'expo-secure-store',
    'expo-font',
    [
      'expo-camera',
      {
        cameraPermission:
          'Capture Rider pickup and handover evidence and scan managed labels.',
        microphonePermission: false,
        recordAudioAndroid: false,
        barcodeScannerEnabled: true,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Measure your location when recording a receiving-point handover.',
      },
    ],
    ['expo-splash-screen', { backgroundColor: '#F8F5EF' }],
  ],
};
export default config;
