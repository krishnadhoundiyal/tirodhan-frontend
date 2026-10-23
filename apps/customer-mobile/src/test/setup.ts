jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
}));

afterEach(() => {
  jest
    .requireActual<typeof import('../features/collection/paymentFlow')>(
      '../features/collection/paymentFlow',
    )
    .clearPaymentFlows();
});
