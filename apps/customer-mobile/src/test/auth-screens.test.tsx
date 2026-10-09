import {
  render,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { router } from 'expo-router';
import { api } from '../api';
import { session } from '../lib/runtime';
import { ApiError } from '../api/errors';
import LoginScreen from '../features/auth/LoginScreen';
import OtpScreen from '../features/auth/OtpScreen';
import { setChallenge } from '../features/auth/challenge';
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Redirect: () => null,
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'command-id' }));
jest.mock('../api', () => ({
  api: { startOtp: jest.fn(), verifyOtp: jest.fn() },
}));
jest.mock('../lib/runtime', () => ({
  session: { establish: jest.fn() },
  previewCatalogue: false,
}));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAwareScrollView:
    jest.requireActual<typeof import('react-native')>('react-native')
      .ScrollView,
}));
beforeEach(() => {
  jest.clearAllMocks();
  setChallenge({ reference: 'challenge', phone: '+919999999999' });
});
test('valid mobile number starts OTP then navigates; invalid number keeps CTA disabled', async () => {
  jest
    .mocked(api.startOtp)
    .mockResolvedValue({ challenge_reference: 'next-challenge' });
  await render(<LoginScreen />);
  expect(
    screen.getByRole('button', { name: 'Continue' }).props.accessibilityState
      .disabled,
  ).toBe(true);
  await fireEvent.changeText(
    screen.getByLabelText('Mobile number'),
    '9999999999',
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Continue' }).props.accessibilityState
        .disabled,
    ).toBe(false),
  );
  await fireEvent.press(screen.getByText('Continue'));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/otp'));
  expect(api.startOtp).toHaveBeenCalledWith({
    client_request_id: 'command-id',
    phone: '+919999999999',
  });
});
test('incorrect OTP displays inline error and keeps session unestablished', async () => {
  jest.mocked(api.verifyOtp).mockRejectedValue(new ApiError(401));
  await render(<OtpScreen />);
  await fireEvent.changeText(
    screen.getByLabelText('Six digit verification code'),
    '999999',
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Verify →' }).props.accessibilityState
        .disabled,
    ).toBe(false),
  );
  await fireEvent.press(screen.getByText('Verify →'));
  expect(
    await screen.findByText(
      'The code you entered is incorrect or expired. Please try again.',
    ),
  ).toBeTruthy();
  expect(session.establish).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});
test('successful OTP establishes the session before leaving verification', async () => {
  const tokens = {
    access_token: 'memory-access',
    refresh_token: 'secure-refresh',
    token_type: 'bearer',
    expires_in: 120,
    user_id: 'user',
  };
  jest.mocked(api.verifyOtp).mockResolvedValue(tokens);
  await render(<OtpScreen />);
  await fireEvent.changeText(
    screen.getByLabelText('Six digit verification code'),
    '123456',
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Verify →' }).props.accessibilityState
        .disabled,
    ).toBe(false),
  );
  await fireEvent.press(screen.getByText('Verify →'));
  await waitFor(() => expect(session.establish).toHaveBeenCalledWith(tokens));
  expect(router.replace).toHaveBeenCalledWith('/');
});
