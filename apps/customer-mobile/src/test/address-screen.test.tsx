import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { router } from 'expo-router';
import type { Address } from '../api/contracts';
import { api } from '../api';
import { ApiError } from '../api/errors';
import { Body } from '../components/ui';
import AddressScreen from '../features/addresses/AddressScreen';
import { DraftProvider, useDraft } from '../features/collection/DraftProvider';

jest.mock('expo-router', () => ({
  router: { canGoBack: () => true, back: jest.fn(), replace: jest.fn() },
}));
jest.mock('../api', () => ({
  api: { addresses: jest.fn(), archiveAddress: jest.fn() },
}));
jest.mock('../lib/repositories', () => ({
  repositories: jest.requireMock('../api').api,
}));
jest.mock('../lib/runtime', () => {
  const snapshot = { status: 'authenticated', userId: 'customer' };
  return {
    session: { subscribe: () => () => {}, getSnapshot: () => snapshot },
  };
});
jest.mock('../components/Header', () => ({ Header: () => null }));
jest.mock('../features/addresses/MapPreview', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
}));

const address: Address = {
  address_id: 'address-id',
  address: 'Saved pickup address',
  label: 'Home',
  status: 'ACTIVE',
  is_default: true,
  version: 7,
  location: null,
};
function DraftObserver() {
  const draft = useDraft();
  return (
    <Body>
      {draft.address ? `Draft: ${draft.address.address_id}` : 'Draft: none'}
    </Body>
  );
}
async function renderAddressScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  await render(
    <QueryClientProvider client={client}>
      <DraftProvider>
        <AddressScreen />
        <DraftObserver />
      </DraftProvider>
    </QueryClientProvider>,
  );
}
beforeEach(() => jest.clearAllMocks());

test('saved addresses load, selection enables continuation, archive clears the booking draft', async () => {
  let resolve!: (value: Address[]) => void;
  jest.mocked(api.addresses).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await renderAddressScreen();
  expect(screen.getAllByLabelText('Loading')).toHaveLength(2);
  expect(
    screen.getByRole('button', { name: 'Continue →' }).props.accessibilityState
      .disabled,
  ).toBe(true);
  resolve([address]);
  const saved = await screen.findByRole('radio', {
    name: 'Home: Saved pickup address',
  });
  await fireEvent.press(saved);
  expect(saved.props.accessibilityState.checked).toBe(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Continue →' }));
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Draft: address-id')).toBeTruthy();

  jest.mocked(api.addresses).mockResolvedValue([]);
  const execute = jest
    .fn()
    .mockResolvedValue({ ...address, status: 'ARCHIVED' });
  jest.mocked(api.archiveAddress).mockReturnValue({ execute });
  await fireEvent.press(screen.getByText('Edit address'));
  await fireEvent.press(screen.getByText('Archive address'));
  await waitFor(() => expect(screen.getByText('Draft: none')).toBeTruthy());
  expect(api.archiveAddress).toHaveBeenCalledWith('address-id');
  expect(execute).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('button', { name: 'Continue →' }).props.accessibilityState
      .disabled,
  ).toBe(true);
});

test('saved-address read failures show safe copy and retry the authoritative query', async () => {
  jest
    .mocked(api.addresses)
    .mockRejectedValueOnce(new ApiError(503))
    .mockResolvedValueOnce([address]);
  await renderAddressScreen();
  await screen.findByText('Unable to load addresses');
  await fireEvent.press(screen.getByText('Try again →'));
  expect(await screen.findByRole('radio')).toBeTruthy();
  expect(api.addresses).toHaveBeenCalledTimes(2);
});

test('a successful empty address read offers manual entry and keeps Continue disabled', async () => {
  jest.mocked(api.addresses).mockResolvedValue([]);
  await renderAddressScreen();
  expect(await screen.findByText('No saved addresses')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: '+ Add new address' }),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Continue →' }).props.accessibilityState
      .disabled,
  ).toBe(true);
});
