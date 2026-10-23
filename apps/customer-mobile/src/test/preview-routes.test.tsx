import {
  render,
  renderHook,
  waitFor,
  screen,
  cleanup,
} from '@testing-library/react-native';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Index from '../../app/index';
import RootLayout from '../../app/_layout';
import ProductLayout from '../../app/(product)/_layout';
import Login from '../../app/login';
import Otp from '../../app/otp';
import AuthRoute from '../preview/AuthRoute';
import { session } from '../lib/runtime';
import { installNotifications } from '../notifications/integration';
import { useAddresses } from '../features/addresses/queries';
import { useCustomerOwner } from '../features/collection/queries';

let mockPreview = true;
jest.mock('../lib/runtime', () => ({
  get previewCatalogue() {
    return mockPreview ?? true;
  },
  queryClient: new (jest.requireActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  ).QueryClient)(),
  session: {
    bootstrap: jest.fn(),
    renewIfExpired: jest.fn(),
    loadPrincipal: jest.fn(),
    getSnapshot: () => {
      throw new Error('Real session read in preview');
    },
    subscribe: () => {
      throw new Error('Real session subscription in preview');
    },
  },
  logout: jest.fn(),
}));
jest.mock('../lib/repositories', () => ({
  repositories: {
    reset: jest.fn(),
    addresses: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../notifications/integration', () => ({
  installNotifications: jest.fn(),
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react'),
    { Text } = jest.requireActual('react-native');
  return {
    router: { navigate: jest.fn() },
    Redirect: ({ href }: { href: string }) =>
      React.createElement(Text, null, `Redirect: ${href}`),
    Stack: () => React.createElement(Text, null, 'Native routes'),
  };
});
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: async () => {},
  hideAsync: async () => {},
}));
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock('../features/auth/LoginScreen', () => ({
  __esModule: true,
  default: () => {
    throw new Error('Preview rendered live login');
  },
}));
jest.mock('../features/auth/OtpScreen', () => ({
  __esModule: true,
  default: () => {
    throw new Error('Preview rendered live OTP');
  },
}));
beforeEach(() => {
  mockPreview = true;
  jest.clearAllMocks();
});
afterEach(async () => {
  await cleanup();
  const runtime = jest.requireMock<{ queryClient: QueryClient }>(
    '../lib/runtime',
  );
  runtime.queryClient.clear();
});
test('cold preview launches Home and admits the existing native product routes', async () => {
  const view = await render(<Index />);
  expect(screen.getByText('Redirect: /(product)/(tabs)')).toBeTruthy();
  await view.rerender(<ProductLayout />);
  expect(screen.getByText('Native routes')).toBeTruthy();
});
test.each([Login, Otp])(
  'direct auth routes redirect preview to Home before rendering live auth',
  async (Route) => {
    await render(<Route />);
    expect(screen.getByText('Redirect: /(product)/(tabs)')).toBeTruthy();
  },
);
test('NONPROD leaves the real login boundary available', async () => {
  mockPreview = false;
  const view = await render(
    <AuthRoute>
      <Text>Live login</Text>
    </AuthRoute>,
  );
  expect(screen.getByText('Live login')).toBeTruthy();
  await view.rerender(<Index />);
  expect(screen.getByText('Redirect: /login')).toBeTruthy();
});
test('preview address and collection query ownership is synthetic and cannot read a real session owner', async () => {
  const client = new QueryClient();
  const hook = await renderHook(
    () => ({ owner: useCustomerOwner(), addresses: useAddresses() }),
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  await waitFor(() => expect(hook.result.current.addresses.data).toEqual([]));
  expect(hook.result.current.owner).toBe(
    'screen-preview:synthetic-navigation-only',
  );
  expect(
    client.getQueryCache().find({
      queryKey: ['addresses', 'screen-preview:synthetic-navigation-only'],
      exact: true,
    }),
  ).toBeDefined();
  await hook.unmount();
  client.clear();
});
test('root uses preview startup, shows its indicator and never installs real-session listeners', async () => {
  const view = await render(<RootLayout />);
  expect(screen.getByText('Native routes')).toBeTruthy();
  expect(
    screen.getByText('Preview Mode · Local fixtures · No real transactions'),
  ).toBeTruthy();
  expect(session.bootstrap).not.toHaveBeenCalled();
  expect(session.loadPrincipal).not.toHaveBeenCalled();
  expect(installNotifications).not.toHaveBeenCalled();
  mockPreview = false;
  await view.rerender(<RootLayout />);
  expect(
    screen.queryByText('Preview Mode · Local fixtures · No real transactions'),
  ).toBeNull();
});
