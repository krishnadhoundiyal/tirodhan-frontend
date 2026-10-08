import { render, screen, fireEvent } from '@testing-library/react-native';
import ProductLayout from '../../app/(product)/_layout';
import type { SessionSnapshot } from '../session/store';
import { session } from '../lib/runtime';
import { ApiError } from '../api/errors';
let mockState: SessionSnapshot;
jest.setTimeout(20000);
jest.mock('../lib/runtime', () => ({
  previewCatalogue: false,
  session: {
    subscribe: () => () => {},
    getSnapshot: () => mockState,
    loadPrincipal: jest.fn(),
  },
  logout: jest.fn(),
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react'),
    { Text } = jest.requireActual('react-native');
  return {
    Redirect: ({ href }: { href: string }) =>
      React.createElement(Text, null, `Redirect: ${href}`),
    Stack: () => React.createElement(Text, null, 'Product route admitted'),
  };
});
jest.mock('../components/Brand', () => ({ Brand: () => null }));
beforeEach(() => {
  mockState = {
    status: 'authenticated',
    userId: 'customer',
    principal: null,
    principalState: 'unavailable',
    principalError: new ApiError(0, 'backendPending'),
    ownerVersion: 1,
  };
  jest.clearAllMocks();
});
test('a direct protected route while signed out redirects before rendering product content', async () => {
  mockState = {
    ...mockState,
    status: 'signedOut',
    userId: null,
    principalState: 'idle',
  };
  await render(<ProductLayout />);
  expect(screen.getByText('Redirect: /login')).toBeTruthy();
  expect(screen.queryByText('Product route admitted')).toBeNull();
});
test('credentials without available principal stay blocked and expose retry', async () => {
  await render(<ProductLayout />);
  expect(screen.queryByText('Product route admitted')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(session.loadPrincipal).toHaveBeenCalledTimes(1);
});
test('loading principal does not permit an admission retry or product access', async () => {
  mockState = { ...mockState, principalState: 'loading' };
  await render(<ProductLayout />);
  expect(
    screen.getByRole('button', { name: 'Try again' }).props.accessibilityState
      .disabled,
  ).toBe(true);
  expect(screen.queryByText('Product route admitted')).toBeNull();
});
test('authoritative non-CUSTOMER is forbidden and CUSTOMER is admitted', async () => {
  mockState = {
    ...mockState,
    principalState: 'available',
    principal: { userId: 'customer', roles: ['RIDER'] },
  };
  const result = await render(<ProductLayout />);
  expect(screen.getByText('Customer access unavailable')).toBeTruthy();
  expect(screen.queryByText('Product route admitted')).toBeNull();
  mockState = {
    ...mockState,
    principal: { userId: 'customer', roles: ['CUSTOMER'] },
  };
  await result.rerender(<ProductLayout />);
  expect(screen.getByText('Product route admitted')).toBeTruthy();
});
