import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  fireEvent,
  screen,
  waitFor,
  cleanup,
} from '@testing-library/react-native';
import { router } from 'expo-router';
import type { Address } from '../api/contracts';
import { api } from '../api';
import { ApiError } from '../api/errors';
import { Body } from '../components/ui';
import AddressScreen from '../features/addresses/AddressScreen';
import { DraftProvider, useDraft } from '../features/collection/DraftProvider';
import * as Location from 'expo-location';
import MapPreview from '../features/addresses/MapPreview';
jest.setTimeout(20000);

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
  default: jest.fn(() => null),
}));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  geocodeAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
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
let client: QueryClient;
async function renderAddressScreen() {
  client = new QueryClient({
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
const point = { latitude: 12.97, longitude: 77.59 };
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(api.addresses).mockResolvedValue([]);
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({
    granted: false,
  } as Location.LocationPermissionResponse);
  jest.mocked(Location.geocodeAsync).mockResolvedValue([point]);
  jest
    .mocked(Location.reverseGeocodeAsync)
    .mockResolvedValue([
      { name: 'Search result', street: 'Temple Road', city: 'Bengaluru' },
    ] as Location.LocationGeocodedAddress[]);
});
afterEach(async () => {
  await cleanup();
  client.clear();
});

test('typed landmark search geocodes the entered text and selects a pin without requesting device permission', async () => {
  await renderAddressScreen();
  await fireEvent.changeText(
    screen.getByLabelText('Search area, landmark or address'),
    '  Temple Road  ',
  );
  await fireEvent.press(screen.getByText('Search this location →'));
  await screen.findByText('Search result, Temple Road, Bengaluru');
  expect(Location.geocodeAsync).toHaveBeenCalledWith('Temple Road');
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  expect(jest.mocked(MapPreview).mock.calls.at(-1)?.[0].location).toEqual(
    point,
  );
});

test('current-location action requests permission before reading device position', async () => {
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({
    granted: true,
  } as Location.LocationPermissionResponse);
  jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({
    coords: {
      ...point,
      accuracy: 5,
      altitude: 10,
      altitudeAccuracy: 2,
      heading: 0,
      speed: 0,
    },
    timestamp: 1,
  });
  await renderAddressScreen();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Use current location →' }),
  );
  await screen.findByText('Search result, Temple Road, Bengaluru');
  expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({
    accuracy: Location.Accuracy.Balanced,
  });
  expect(Location.geocodeAsync).not.toHaveBeenCalled();
  expect(jest.mocked(MapPreview).mock.calls.at(-1)?.[0].location).toEqual(
    point,
  );
});

test('denying current-location permission leaves typed search and manual address entry usable', async () => {
  await renderAddressScreen();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Use current location →' }),
  );
  await screen.findByText(
    'Location permission is off. Choose a saved address or add one manually.',
  );
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  await fireEvent.changeText(
    screen.getByLabelText('Search area, landmark or address'),
    'Temple Road',
  );
  await fireEvent(
    screen.getByLabelText('Search area, landmark or address'),
    'submitEditing',
  );
  await screen.findByText('Search result, Temple Road, Bengaluru');
  expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(Location.geocodeAsync).toHaveBeenCalledWith('Temple Road');
  await fireEvent.press(
    screen.getByRole('button', { name: '+ Add new address' }),
  );
  await fireEvent.changeText(
    screen.getByLabelText('Complete pickup address'),
    'Manual house address',
  );
  expect(screen.getByLabelText('Complete pickup address').props.value).toBe(
    'Manual house address',
  );
});

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
