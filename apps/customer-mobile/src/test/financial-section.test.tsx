import { AppState, Platform, type AppStateStatus } from 'react-native';
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from '@tanstack/react-query';
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import FinancialSection from '../features/collection/FinancialSection';
import { repositories } from '../lib/repositories';
import { createDevelopmentRepositories } from '../features/collection/developmentRepositories';
import type { CollectionDetail } from '../api/customer-contracts';
import type { PaymentAttempt } from '../api/contracts';

let mockExpoGo = false;
jest.mock('expo', () => ({ isRunningInExpoGo: () => mockExpoGo }));
let mockPreview = false,
  mockSequence = 100;
const mockSnapshot = {
  userId: 'owner',
  ownerVersion: 1,
  status: 'authenticated',
};
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) =>
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(callback, [callback]),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: () =>
    '00000000-0000-4000-8000-' + String(++mockSequence).padStart(12, '0'),
}));
jest.mock('../lib/runtime', () => ({
  get previewCatalogue() {
    return mockPreview;
  },
  session: { subscribe: () => () => {}, getSnapshot: () => mockSnapshot },
}));
jest.mock('../lib/navigation', () => ({
  navigationSession: {
    subscribe: () => () => {},
    getSnapshot: () => mockSnapshot,
  },
  navigationOwner: (s: typeof mockSnapshot) => s.userId,
}));
jest.mock('../lib/repositories', () => ({
  repositories: {
    payment: jest.fn(),
    detail: jest.fn(),
    checkout: jest.fn(),
    paymentAttempt: jest.fn(),
    refunds: jest.fn(),
  },
  nativeCheckout: null,
}));
let detail: CollectionDetail, client: QueryClient;
const initialAppState = AppState.currentState;
beforeEach(async () => {
  mockPreview = false;
  mockExpoGo = false;
  mockSequence = 100;
  AppState.currentState = 'active';
  jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
  const secure = new Map<string, string>();
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async (key) => secure.get(key) ?? null);
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      secure.set(key, value);
    });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    secure.delete(key);
  });
  detail = await createDevelopmentRepositories().detail(
    '88888888-8888-4888-8888-888888888888',
  );
  jest
    .mocked(repositories.payment)
    .mockImplementation(async () => ({ ...detail.payment }));
  jest
    .mocked(repositories.detail)
    .mockImplementation(async () => ({ ...detail }));
  jest.mocked(repositories.refunds).mockResolvedValue({ refunds: [] });
  jest.mocked(repositories.checkout).mockImplementation(async () => ({
    request_id: detail.request_id,
    payment_attempt_id: 'attempt',
    provider: 'RAZORPAY',
    public_key_id: 'rzp_test_example',
    provider_order_id: 'order_original',
    merchant_display_name: 'Backend Merchant',
    amount_minor: detail.payment.amount_minor,
    currency: 'INR',
    expires_at: detail.payment.expires_at!,
    checkout_ready_until: new Date(Date.now() + 60000).toISOString(),
  }));
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  notifyManager.setNotifyFunction((callback) => {
    callback();
  });
});
afterEach(async () => {
  await waitFor(() => expect(client.isMutating()).toBe(0));
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await cleanup();
  client.clear();
  AppState.currentState = initialAppState;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});
const attempt = (
  action: PaymentAttempt['action'] = 'START',
): PaymentAttempt => ({
  payment_attempt_id: 'attempt',
  status: 'PENDING',
  provider: 'RAZORPAY',
  provider_order_id: 'order_original',
  provider_payment_id: null,
  failure_code: null,
  action,
  action_reason: action === 'WAIT' ? 'VERIFICATION_REQUIRED' : 'CHECKOUT_READY',
  checkout_ready_until:
    action === 'WAIT' ? null : new Date(Date.now() + 60000).toISOString(),
});
test('Pay securely uses coordinator; SDK completion cannot show success before authoritative manual refresh', async () => {
  const execute = jest.fn(async () => attempt());
  jest.mocked(repositories.paymentAttempt).mockReturnValue({ execute });
  const native = { launch: jest.fn(async () => {}) };
  await render(
    <QueryClientProvider client={client}>
      <FinancialSection detail={detail} checkout={native} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(repositories.payment).toHaveBeenCalledTimes(1));
  await fireEvent.press(screen.getByRole('button', { name: 'Pay securely' }));
  await waitFor(() => expect(native.launch).toHaveBeenCalledTimes(1));
  await screen.findByText('Payment awaiting confirmation');
  expect(screen.queryByText('Payment received')).toBeNull();
  detail = {
    ...detail,
    status: 'ACCEPTED',
    payment: {
      ...detail.payment,
      status: 'SUCCEEDED',
      action: 'UNAVAILABLE',
      action_reason: 'PAYMENT_RECEIVED',
      retry_allowed: false,
      succeeded_at: new Date().toISOString(),
    },
  };
  await fireEvent.press(
    screen.getByRole('button', { name: 'Refresh payment status' }),
  );
  await screen.findByText('Payment received');
  expect(execute).toHaveBeenCalledTimes(1);
  expect(
    client.getQueryData<CollectionDetail>([
      'collection',
      'owner',
      detail.request_id,
    ])?.status,
  ).toBe('ACCEPTED');
});
test('WAIT exposes verification inquiry without opening SDK; foreground return refreshes backend state', async () => {
  let onState: (state: AppStateStatus) => void = () => {};
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      onState = listener as (state: AppStateStatus) => void;
      return { remove: jest.fn() };
    });
  detail.payment = {
    ...detail.payment,
    status: 'CONFIRMING',
    action: 'WAIT',
    action_reason: 'RECONCILIATION_REQUIRED',
    retry_allowed: false,
    verification_pending: true,
  };
  const execute = jest.fn(async () => attempt('WAIT'));
  jest.mocked(repositories.paymentAttempt).mockReturnValue({ execute });
  const native = { launch: jest.fn() };
  await render(
    <QueryClientProvider client={client}>
      <FinancialSection detail={detail} checkout={native} />
    </QueryClientProvider>,
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Verify and continue payment' }),
  );
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  expect(native.launch).not.toHaveBeenCalled();
  expect(repositories.checkout).not.toHaveBeenCalled();
  await screen.findByText('Payment awaiting confirmation');
  await act(() => {
    onState('background');
  });
  detail = {
    ...detail,
    payment: {
      ...detail.payment,
      status: 'SUCCEEDED',
      action: 'UNAVAILABLE',
      action_reason: 'PAYMENT_RECEIVED',
      verification_pending: false,
      succeeded_at: new Date().toISOString(),
    },
  };
  await act(() => {
    onState('active');
  });
  await screen.findByText('Payment received');
});
test('SCREEN_PREVIEW blocks a supplied native adapter and secure payment command storage', async () => {
  mockPreview = true;
  const native = { launch: jest.fn() };
  await render(
    <QueryClientProvider client={client}>
      <FinancialSection detail={detail} checkout={native} />
    </QueryClientProvider>,
  );
  await screen.findByText(
    'Development preview: provider checkout is not connected.',
  );
  const button = screen.getByRole('button', { name: 'Pay securely' });
  expect(button.props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(button);
  expect(repositories.paymentAttempt).not.toHaveBeenCalled();
  expect(native.launch).not.toHaveBeenCalled();
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  detail = {
    ...detail,
    payment: {
      ...detail.payment,
      status: 'SUCCEEDED',
      action: 'UNAVAILABLE',
      action_reason: 'PAYMENT_RECEIVED',
      retry_allowed: false,
      succeeded_at: new Date().toISOString(),
    },
  };
  await fireEvent.press(
    screen.getByRole('button', { name: 'Refresh payment status' }),
  );
  await screen.findByText('Payment received');
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
});

test.each(['Expo Go', 'web'])(
  '%s blocks even an injected adapter and never touches payment recovery',
  async (mode) => {
    if (mode === 'Expo Go') mockExpoGo = true;
    else jest.replaceProperty(Platform, 'OS', 'web');
    const native = { available: jest.fn(() => true), launch: jest.fn() };
    await render(
      <QueryClientProvider client={client}>
        <FinancialSection detail={detail} checkout={native} />
      </QueryClientProvider>,
    );
    const button = await screen.findByRole('button', { name: 'Pay securely' });
    expect(button.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(button);
    expect(native.available).not.toHaveBeenCalled();
    expect(native.launch).not.toHaveBeenCalled();
    expect(repositories.paymentAttempt).not.toHaveBeenCalled();
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  },
);
