import { isRunningInExpoGo } from 'expo';

// Expo Go's host APNs/FCM identity is not a Tirodhan installation.
// StoreClient also includes dev builds, so use Expo's native runtime detection.
export const isExpoGoPreview = () => __DEV__ && isRunningInExpoGo();
