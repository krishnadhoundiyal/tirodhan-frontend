import type { NativeCheckout } from './paymentFlow';

// Metro uses the native implementation on Android and iOS.
export const nativeCheckout: NativeCheckout | null = null;
