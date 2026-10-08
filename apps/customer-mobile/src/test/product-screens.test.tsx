import { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  fireEvent,
  screen,
  waitFor,
  cleanup,
} from '@testing-library/react-native';
import { router } from 'expo-router';
import ReviewScreen from '../features/collection/ReviewScreen';
import CollectionDetailScreen from '../features/collection/CollectionDetailScreen';
import AddressScreen from '../features/addresses/AddressScreen';
import { DraftProvider, useDraft } from '../features/collection/DraftProvider';
import { developmentAddresses } from '../features/collection/developmentRepositories';
import { repositories } from '../lib/repositories';
import { Body } from '../components/ui';
import * as Location from 'expo-location';
let mockRequestId = '11111111-1111-4111-8111-111111111111';
jest.setTimeout(20000);
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  },
  useLocalSearchParams: () => ({ requestId: mockRequestId }),
}));
jest.mock('../lib/runtime', () => {
  const snapshot = { status: 'signedOut', userId: null };
  return {
    previewCatalogue: true,
    session: { subscribe: () => () => {}, getSnapshot: () => snapshot },
  };
});
jest.mock('../lib/repositories', () => ({
  repositories: jest
    .requireActual<
      typeof import('../features/collection/developmentRepositories')
    >('../features/collection/developmentRepositories')
    .createDevelopmentRepositories(),
}));
jest.mock('../components/Header', () => ({ Header: () => null }));
jest.mock('../features/media/MediaImage', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('../features/addresses/MapPreview', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest
    .fn()
    .mockResolvedValue({ granted: false }),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));
function Seed({ far = false }: { far?: boolean }) {
  const draft = useDraft();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    draft.selectAddress(developmentAddresses[0]!);
    draft.toggleCategory('flowers');
    if (far) draft.setCurrentLocation(developmentAddresses[0]!.location!);
  }, [draft, far]);
  return (
    <Body>{`Draft categories: ${draft.categoryCodes.join(',')} · address: ${draft.address?.address_id ?? 'none'}`}</Body>
  );
}
let client: QueryClient;
async function show(element: React.ReactNode, seed = false, far = false) {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  await render(
    <QueryClientProvider client={client}>
      <DraftProvider>
        {seed && <Seed far={far} />}
        {element}
      </DraftProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(client.isFetching()).toBe(0));
}
beforeEach(() => {
  repositories.reset();
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockRequestId = '11111111-1111-4111-8111-111111111111';
});
afterEach(async () => {
  await waitFor(() => expect(client?.isFetching() ?? 0).toBe(0));
  await cleanup();
  client?.clear();
});
test('Review item selector edits inline, preserves address, supports quantities and never navigates Home', async () => {
  await show(<ReviewScreen />, true);
  await screen.findByText('Used Flowers & Garlands');
  await fireEvent.press(screen.getByText('Add or edit →'));
  await fireEvent.press(
    screen.getByRole('checkbox', {
      name: 'Select Old Holy Books & Sacred Paper',
    }),
  );
  await fireEvent.changeText(
    screen.getByLabelText(
      'Declared quantity for Old Holy Books & Sacred Paper',
    ),
    '2',
  );
  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Save amounts for Old Holy Books & Sacred Paper',
    }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Done · return to Review' }),
  );
  expect(
    screen.getByText('Draft categories: flowers,books · address: preview-home'),
  ).toBeTruthy();
  expect(screen.getByText('Quantity: 2')).toBeTruthy();
  expect(router.push).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByText('Remove Old Holy Books & Sacred Paper'),
  );
  expect(
    screen.getByText('Draft categories: flowers · address: preview-home'),
  ).toBeTruthy();
});
test('Review requires serviceability and a server slot, then opens pending payment detail', async () => {
  await show(<ReviewScreen />, true);
  expect(
    screen.getByRole('button', { name: 'Confirm & Pay →' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Check pickup availability' }),
  );
  const radios = await screen.findAllByRole('radio');
  await fireEvent.press(radios[0]!);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Confirm & Pay →' }),
  );
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/collections/[requestId]' }),
    ),
  );
  const route = jest.mocked(router.push).mock.calls[0]![0] as unknown as {
    params: { requestId: string };
  };
  expect(
    (await repositories.detail(route.params.requestId)).payment.status,
  ).toBe('PENDING');
});
test('a terminal technical failure permits a fresh availability check instead of replaying the failed context', async () => {
  const original = repositories.readServiceability.bind(repositories);
  const read = jest
    .spyOn(repositories, 'readServiceability')
    .mockImplementationOnce(async (id) => ({
      ...(await original(id)),
      status: 'TECHNICAL_FAILURE',
    }));
  const prepare = jest.spyOn(repositories, 'serviceability');
  await show(<ReviewScreen />, true);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Check pickup availability' }),
  );
  await screen.findByText('We couldn’t check availability. Please try again.');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Check pickup availability' }),
  );
  await screen.findAllByRole('radio');
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(read.mock.calls[0]?.[0]).not.toBe(read.mock.calls[1]?.[0]);
});
test('far saved address shows a confirmation modal without requesting location permission', async () => {
  await show(<AddressScreen />, true, true);
  const far = await screen.findByRole('radio', {
    name: 'Preview Temple: Preview pickup location · Dwarka, New Delhi',
  });
  await fireEvent.press(far);
  await fireEvent.press(screen.getByRole('button', { name: 'Continue →' }));
  expect(await screen.findByText('Confirm pickup location')).toBeTruthy();
  expect(router.back).not.toHaveBeenCalled();
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Use this address' }),
  );
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(
    screen.getByText('Draft categories: flowers · address: preview-temple'),
  ).toBeTruthy();
});
test('destructive cancellation waits for confirmation and reads independent refund progress', async () => {
  const cancel = jest.spyOn(repositories, 'cancel');
  await show(<CollectionDetailScreen />);
  await screen.findByText('Collection scheduled');
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel pickup' }));
  expect(cancel).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Keep pickup' }));
  expect(cancel).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel pickup' }));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Confirm cancellation' }),
  );
  await screen.findByText(
    'Pickup cancelled. Refund progress will update separately.',
  );
  expect(cancel).toHaveBeenCalledTimes(1);
  expect((await repositories.refunds(mockRequestId)).refunds[0]?.status).toBe(
    'INITIATED',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'View cancellation and refund' }),
  );
  expect(await screen.findByText('Refund initiated')).toBeTruthy();
  expect(screen.queryByText('Refund completed')).toBeNull();
  cancel.mockRestore();
});
test('planning race explains cutoff and refreshes eligibility; uncertain retry keeps one command', async () => {
  mockRequestId = '33333333-3333-4333-8333-333333333333';
  await show(<CollectionDetailScreen />);
  await screen.findByText('Planning race preview');
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel pickup' }));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Confirm cancellation' }),
  );
  await screen.findAllByText(
    'This pickup can no longer be cancelled because planning has already started.',
  );
  expect((await repositories.detail(mockRequestId)).cancellation.allowed).toBe(
    false,
  );
});
test('a server-ineligible pickup never offers a cancellation command', async () => {
  mockRequestId = '22222222-2222-4222-8222-222222222222';
  await show(<CollectionDetailScreen />);
  await screen.findAllByText('Collected by Tirodhan');
  expect(screen.queryByRole('button', { name: 'Cancel pickup' })).toBeNull();
});
test.each([
  ['0', 'Refund initiated'],
  ['1', 'Refund processing'],
  ['2', 'Refund completed'],
  ['3', 'Refund awaiting confirmation'],
  ['4', 'Refund needs attention'],
])(
  'cancelled pickup independently displays refund state %s',
  async (suffix, label) => {
    mockRequestId = `66666666-6666-4666-8666-66666666666${suffix}`;
    await show(<CollectionDetailScreen />);
    expect(await screen.findByText(label)).toBeTruthy();
    if (suffix !== '2')
      expect(screen.queryByText('Refund completed')).toBeNull();
    if (suffix === '3')
      expect(
        screen.getByText(
          'We’re confirming your refund with the payment provider. Please check back for an update.',
        ),
      ).toBeTruthy();
    expect(screen.queryByText('INITIATION_UNCERTAIN')).toBeNull();
  },
);
