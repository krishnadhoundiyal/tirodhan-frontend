import { isRunningInExpoGo } from 'expo';
import { TurboModuleRegistry } from 'react-native';
import { ApiError } from '../../api/errors';
import { appMode, hasCustomerCapability } from '../../lib/runtime';
import type { NativeCheckout } from './paymentFlow';
import { createRazorpayAdapter, type RazorpaySdk } from './razorpayAdapter';

function canUseCheckout() {
  return (
    appMode === 'NONPROD' &&
    !isRunningInExpoGo() &&
    hasCustomerCapability('payment') &&
    hasCustomerCapability('checkout') &&
    TurboModuleRegistry.get('RNRazorpayCheckout') !== null &&
    TurboModuleRegistry.get('RazorpayEventEmitter') !== null
  );
}

const checkout = createRazorpayAdapter(canUseCheckout, async () => {
  // The SDK creates its event emitter at import time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('react-native-razorpay') as { default: RazorpaySdk }).default;
});

export const nativeCheckout: NativeCheckout = {
  available: checkout.available,
  async launch(parameters, authorize) {
    if (!/^rzp_test_[A-Za-z0-9]+$/.test(parameters.public_key_id))
      throw new ApiError(0, 'configuration');
    await checkout.launch(parameters, authorize);
  },
};
