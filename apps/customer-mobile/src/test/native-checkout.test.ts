import { isRunningInExpoGo } from 'expo';
import { Platform, TurboModuleRegistry } from 'react-native';
import type { CheckoutParameters } from '../api/customer-contracts';
import { nativeCheckout } from '../features/collection/nativeCheckout.native';

let mockMode = 'NONPROD';
const mockCapability = jest.fn(() => true);
const mockOpen = jest.fn(async () => ({}));
const mockSdkLoaded = jest.fn();

jest.mock('expo', () => ({
  ...jest.requireActual('expo'),
  isRunningInExpoGo: jest.fn(() => false),
}));
jest.mock('../lib/runtime', () => ({
  get appMode() {
    return mockMode;
  },
  hasCustomerCapability: () => mockCapability(),
}));
jest.mock('react-native-razorpay', () => {
  mockSdkLoaded();
  return { __esModule: true, default: { open: mockOpen } };
});

const parameters: CheckoutParameters = {
  request_id: 'request',
  payment_attempt_id: 'attempt',
  provider: 'RAZORPAY',
  public_key_id: 'rzp_test_example',
  provider_order_id: 'order_original',
  merchant_display_name: 'Tirodhan',
  amount_minor: 35000,
  currency: 'INR',
  expires_at: new Date(Date.now() + 300000).toISOString(),
  checkout_ready_until: new Date(Date.now() + 60000).toISOString(),
};

test('native checkout fails closed in preview, Expo Go, with missing capabilities or modules, and for live keys', async () => {
  const authorize = jest.fn();
  const module = jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue({});
  const platform = jest.replaceProperty(Platform, 'OS', 'ios');
  mockMode = 'SCREEN_PREVIEW';
  expect(nativeCheckout.available?.()).toBe(false);
  mockMode = 'PRODUCTION';
  expect(nativeCheckout.available?.()).toBe(false);
  mockMode = 'NONPROD';
  jest.mocked(isRunningInExpoGo).mockReturnValueOnce(true);
  expect(nativeCheckout.available?.()).toBe(false);
  mockCapability.mockReturnValueOnce(false);
  expect(nativeCheckout.available?.()).toBe(false);
  module.mockReturnValueOnce(null);
  expect(nativeCheckout.available?.()).toBe(false);
  await expect(
    nativeCheckout.launch(
      { ...parameters, public_key_id: 'rzp_live_example' },
      authorize,
    ),
  ).rejects.toMatchObject({ kind: 'configuration' });
  expect(mockSdkLoaded).not.toHaveBeenCalled();
  expect(authorize).not.toHaveBeenCalled();

  module.mockImplementation((name) =>
    name === 'RNRazorpayCheckout' ? {} : null,
  );
  expect(nativeCheckout.available?.()).toBe(false);
  platform.replaceValue('android');
  expect(nativeCheckout.available?.()).toBe(true);
  await nativeCheckout.launch(parameters, authorize);
  expect(mockSdkLoaded).toHaveBeenCalledTimes(1);
  expect(authorize).toHaveBeenCalledTimes(1);
  expect(mockOpen).toHaveBeenCalledWith({
    key: 'rzp_test_example',
    order_id: 'order_original',
    amount: 35000,
    currency: 'INR',
    name: 'Tirodhan',
  });
  module.mockRestore();
  platform.restore();
});
