import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from '@tanstack/react-query';
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
import { Body, Button } from '../components/ui';
import * as Location from 'expo-location';
import { developmentWeightPolicy } from '../features/collection/developmentWeightPricing';
import { createCustomerApi } from '../api/customer-client';
import { createApi } from '../api/client';
import { Transport } from '../api/transport';
import { ApiError } from '../api/errors';
let mockCommandSequence = 40;
jest.mock('expo-crypto', () => ({
  randomUUID: () =>
    `77777777-7777-4777-8777-${String(++mockCommandSequence).padStart(12, '0')}`,
}));
let mockRequestId = '11111111-1111-4111-8111-111111111111';
let mockCompensationEnabled = true;
jest.setTimeout(20000);
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) =>
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(callback, [callback]),
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
    hasCustomerCapability: () => mockCompensationEnabled,
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
    draft.declare('flowers', {
      weightBand: 'BELOW_B',
      volumeLitres: '2.5',
      policyId: developmentWeightPolicy.policy_id,
      policyRevision: developmentWeightPolicy.policy_revision,
    });
    if (far) draft.setCurrentLocation(developmentAddresses[0]!.location!);
  }, [draft, far]);
  return (
    <Body>{`Draft categories: ${draft.categoryCodes.join(',')} · address: ${draft.address?.address_id ?? 'none'}`}</Body>
  );
}
let client: QueryClient;
const initialAppState = AppState.currentState;
beforeEach(() => {
  AppState.currentState = 'active';
});
afterEach(() => {
  AppState.currentState = initialAppState;
});
async function show(element: React.ReactNode, seed = false, far = false) {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 30000 },
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
async function reviewPrice() {
  await fireEvent.press(
    await screen.findByRole('checkbox', {
      name: 'I have reviewed this pickup price',
    }),
  );
}
beforeAll(() => {
  notifyManager.setScheduler((callback) => queueMicrotask(callback));
});
afterAll(() =>
  notifyManager.setScheduler((callback) => setTimeout(callback, 0)),
);
beforeEach(() => {
  repositories.source = 'development';
  repositories.reset();
  jest.restoreAllMocks();
  jest.clearAllMocks();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() });
  mockRequestId = '11111111-1111-4111-8111-111111111111';
  mockCompensationEnabled = true;
});
function ChangeTestAddress() {
  const draft = useDraft();
  return (
    <Button
      label="Test change address"
      onPress={() => draft.selectAddress(developmentAddresses[1]!)}
    />
  );
}
test('backend Review exposes projected states but incomplete volumes block hold submission', async () => {
  repositories.source = 'backend';
  const original = repositories.quote.bind(repositories);
  jest.spyOn(repositories, 'quote').mockImplementation(async (input) => ({
    ...(await original(input)),
    total_volume_ml: null,
    live_customer_holds_available: false,
    hold_blocker: 'ITEM_VOLUME_DECLARATIONS_REQUIRED',
  }));
  const hold = jest.spyOn(repositories, 'holdSlot');
  await show(<ReviewScreen />, true);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Check pickup availability' }),
  );
  const radios = await screen.findAllByRole('radio');
  expect(radios).toHaveLength(4);
  expect(radios[2]!.props.accessibilityState.disabled).toBe(true);
  expect(radios[3]!.props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(radios[1]!);
  expect(
    screen.getByRole('button', { name: 'Confirm & Pay →' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  expect(
    screen.getByText(
      'Enter the occupied volume for every selected item before booking.',
    ),
  ).toBeTruthy();
  expect(hold).not.toHaveBeenCalled();
  repositories.source = 'development';
});
test('refresh and changed address invalidate a previous slot selection', async () => {
  await show(
    <>
      <ReviewScreen />
      <ChangeTestAddress />
    </>,
    true,
  );
  await reviewPrice();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Check pickup availability' }),
  );
  await fireEvent.press((await screen.findAllByRole('radio'))[0]!);
  expect(
    screen.getByRole('button', { name: 'Confirm & Pay →' }).props
      .accessibilityState.disabled,
  ).toBe(false);
  await fireEvent.press(screen.getByText('Refresh pickup times'));
  await waitFor(() => expect(client.isFetching()).toBe(0));
  expect(
    screen.getByRole('button', { name: 'Confirm & Pay →' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  await fireEvent.press((await screen.findAllByRole('radio'))[0]!);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Test change address' }),
  );
  expect(screen.queryAllByRole('radio')).toHaveLength(0);
  expect(
    screen.getByRole('button', { name: 'Confirm & Pay →' }).props
      .accessibilityState.disabled,
  ).toBe(true);
});
test('late availability from the previous address cannot replace the current context', async () => {
  const read = repositories.slots.bind(repositories);
  let resolve!: (value: Awaited<ReturnType<typeof read>>) => void;
  let oldData!: Awaited<ReturnType<typeof read>>;
  const fetchSlots = jest
    .spyOn(repositories, 'slots')
    .mockImplementationOnce(async (id) => {
      oldData = await read(id);
      return new Promise((done) => {
        resolve = done;
      });
    });
  await show(
    <>
      <ReviewScreen />
      <ChangeTestAddress />
    </>,
    true,
  );
  await reviewPrice();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Check pickup availability' }),
  );
  await waitFor(() => expect(fetchSlots).toHaveBeenCalledTimes(1));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Test change address' }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Check pickup availability' }),
  );
  await screen.findAllByRole('radio');
  const currentContext = fetchSlots.mock.calls[1]![0];
  expect(currentContext).not.toBe(oldData.serviceability_context_id);
  oldData.slots.forEach((slot) => {
    slot.status = 'FULL';
    slot.remaining_bookings = 0;
  });
  resolve(oldData);
  await waitFor(() => expect(client.isFetching()).toBe(0));
  const radios = screen.getAllByRole('radio');
  expect(radios[0]!.props.accessibilityState.disabled).toBe(false);
  await fireEvent.press(radios[0]!);
  expect(
    screen.getByRole('button', { name: 'Confirm & Pay →' }).props
      .accessibilityState.disabled,
  ).toBe(false);
});
afterEach(async () => {
  await waitFor(() => expect(client?.isFetching() ?? 0).toBe(0));
  await waitFor(() => expect(client?.isMutating() ?? 0).toBe(0));
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
  await reviewPrice();
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
test('NONPROD Review completes declarations, reviewed quote, V2 hold and pending-payment booking through HTTP adapters', async () => {
  const quoteFixture = repositories.quote.bind(repositories);
  repositories.source = 'backend';
  const contextId = '88888888-8888-4888-8888-888888888888';
  const requestId = '99999999-9999-4999-8999-999999999999';
  const start = Math.ceil((Date.now() + 86400000) / 1800000) * 1800000;
  const context = {
    serviceability_context_id: contextId,
    source_address_id: developmentAddresses[0]!.address_id,
    source_address_version: 1,
    status: 'SERVICEABLE',
    cell_id: null,
    failure_code: null,
    expires_at: new Date(Date.now() + 1200000).toISOString(),
    resolved_at: new Date().toISOString(),
  };
  let holdBody!: import('../api/slot-contracts').HoldSlot;
  let bookingBody!: import('../api/contracts').CollectionCreate;
  const hold = () => ({
    reservation_id: holdBody.client_command_id,
    bound_request_id: null,
    admission_basis: 'PROJECTED_ALLOWANCE',
    bookable: true,
    book_by: new Date(Date.now() + 300000).toISOString(),
    expires_at: new Date(Date.now() + 600000).toISOString(),
  });
  const fetcher = jest.fn(
    async (url: string | URL | Request, options?: RequestInit) => {
      const path = String(url).replace('https://nonprod.example', '');
      const body = options?.body ? JSON.parse(String(options.body)) : null;
      let result: unknown;
      if (path === '/v1/customer/weight-pricing-policy')
        result = developmentWeightPolicy;
      else if (path === '/v1/customer/collection-quotes')
        result = await quoteFixture(body);
      else if (path.startsWith('/v1/serviceability/contexts')) result = context;
      else if (path.startsWith('/v2/customer/slot-availability'))
        result = {
          region_id: contextId,
          capacity_certified: false,
          allowance_is_estimate: true,
          standard_pickup_seconds: 300,
          standard_discharge_seconds: 120,
          slots: [
            {
              slot_start: new Date(start).toISOString(),
              slot_end: new Date(start + 1800000).toISOString(),
              status: 'LIMITED',
              remaining_bookings: 1,
              policy_version: 1,
              source_version: 1,
              generation: 3,
              computed_at: new Date().toISOString(),
              valid_until: context.expires_at,
              admission_basis: 'PROJECTED_ALLOWANCE',
              capacity_certified: false,
            },
          ],
        };
      else if (path === '/v2/customer/slot-holds') {
        holdBody = body;
        result = hold();
      } else if (path.startsWith('/v2/customer/slot-holds/')) result = hold();
      else if (path === '/v1/collection-requests') {
        bookingBody = body;
        result = {
          request_id: requestId,
          client_request_id: body.client_request_id,
          status: 'PENDING_PAYMENT',
          quoted_amount_minor: 35000,
          currency: 'INR',
          payment_id: contextId,
          payment_expires_at: context.expires_at,
          items: body.items.map(
            (item: import('../api/contracts').CollectionItemInput) => ({
              ...item,
              request_item_id: requestId,
              quoted_line_amount_minor: 35000,
              currency: 'INR',
              pricing_rule_version: 'server-fixture',
            }),
          ),
        };
      } else throw new Error('Unexpected HTTP contract in test');
      return { ok: true, status: 200, json: async () => result } as Response;
    },
  );
  const transport = new Transport(
    'https://nonprod.example',
    {
      accessToken: () => 'mock-owner-token',
      refresh: async () => {},
      clear: async () => {},
    },
    () => 'header-key',
    fetcher,
  );
  const api = createApi(transport),
    customer = createCustomerApi(transport, () => {});
  jest
    .spyOn(repositories, 'weightPolicy')
    .mockImplementation(customer.weightPolicy);
  jest.spyOn(repositories, 'quote').mockImplementation(customer.quote);
  jest
    .spyOn(repositories, 'serviceability')
    .mockImplementation((address) =>
      api.serviceability({ source_address_id: address.address_id }),
    );
  jest
    .spyOn(repositories, 'readServiceability')
    .mockImplementation(api.readServiceability);
  jest.spyOn(repositories, 'slots').mockImplementation(customer.slots);
  jest.spyOn(repositories, 'holdSlot').mockImplementation(api.holdSlot);
  jest.spyOn(repositories, 'readHold').mockImplementation(api.readHold);
  jest
    .spyOn(repositories, 'createCollection')
    .mockImplementation(api.createCollection);
  await show(<ReviewScreen />, true);
  expect(await screen.findByText('Pickup price: ₹350.00')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Check pickup availability' }),
  );
  await fireEvent.press((await screen.findAllByRole('radio'))[0]!);
  expect(
    screen.getByRole('button', { name: 'Confirm & Pay →' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  await reviewPrice();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Confirm & Pay →' }),
  );
  await waitFor(() =>
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/collections/[requestId]',
      params: { requestId },
    }),
  );
  expect(holdBody.mass_g).toBe(2000);
  expect(holdBody.volume_ml).toBe(2500);
  expect(holdBody.items).toEqual(bookingBody.items);
  expect(holdBody.confirmed_quote).toEqual(bookingBody.confirmed_quote);
  expect(bookingBody.capacity_reservation_id).toBe(holdBody.client_command_id);
  expect(
    fetcher.mock.calls.filter(([url]) =>
      String(url).endsWith('/v2/customer/slot-holds'),
    ),
  ).toHaveLength(1);
  expect(bookingBody).not.toHaveProperty('total_amount_minor');
});
test('editing volume refreshes the quote, clears price review and incomplete entry blocks confirmation', async () => {
  const quote = jest.spyOn(repositories, 'quote');
  await show(<ReviewScreen />, true);
  await reviewPrice();
  await fireEvent.press(screen.getByText('Add or edit →'));
  await fireEvent.changeText(
    await screen.findByLabelText(
      'Occupied volume in litres for Used Flowers & Garlands',
    ),
    '3.125',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Done · return to Review' }),
  );
  await screen.findByText('Total declared volume: 3.125 L');
  expect(
    screen.getByRole('checkbox', { name: 'I have reviewed this pickup price' })
      .props.accessibilityState.checked,
  ).toBe(false);
  expect(quote.mock.calls.at(-1)?.[0].items[0]?.declared_volume_ml).toBe(3125);
  await fireEvent.press(screen.getByText('Add or edit →'));
  await fireEvent.changeText(
    await screen.findByLabelText(
      'Occupied volume in litres for Used Flowers & Garlands',
    ),
    '',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Done · return to Review' }),
  );
  expect(
    await screen.findByText(
      'Enter the occupied volume for every selected item before booking.',
    ),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Confirm & Pay →' }).props
      .accessibilityState.disabled,
  ).toBe(true);
});
test('numerical kilograms appear only above T and exact threshold cannot request a quote', async () => {
  const quote = jest.spyOn(repositories, 'quote');
  await show(<ReviewScreen />, true);
  await fireEvent.press(screen.getByText('Add or edit →'));
  expect(
    screen.queryByLabelText('Weight in kilograms for Used Flowers & Garlands'),
  ).toBeNull();
  await fireEvent.press(
    await screen.findByRole('radio', {
      name: /Larger collection.*Used Flowers & Garlands/,
    }),
  );
  const input = await screen.findByLabelText(
    'Weight in kilograms for Used Flowers & Garlands',
  );
  await fireEvent.changeText(input, '10');
  const calls = quote.mock.calls.length;
  await fireEvent.changeText(input, '10.001');
  await waitFor(() => expect(quote.mock.calls.length).toBeGreaterThan(calls));
  expect(quote.mock.calls.at(-1)?.[0].items[0]?.weight_kg).toBe('10.001');
  await fireEvent.press(
    screen.getByRole('radio', {
      name: /Small collection.*Used Flowers & Garlands/,
    }),
  );
  expect(
    screen.queryByLabelText('Weight in kilograms for Used Flowers & Garlands'),
  ).toBeNull();
  await waitFor(() =>
    expect(quote.mock.calls.at(-1)?.[0].items[0]?.weight_kg).toBeNull(),
  );
});
test('stale quote refreshes current policy and requires explicit band reselection and price review', async () => {
  const read = jest.spyOn(repositories, 'weightPolicy');
  const quote = jest.spyOn(repositories, 'quote');
  await show(<ReviewScreen />, true);
  await reviewPrice();
  read.mockResolvedValue({
    ...developmentWeightPolicy,
    policy_revision: 2,
    first_band_label: 'Updated small band',
  });
  quote.mockRejectedValueOnce(
    new ApiError(409, 'http', 'WEIGHT_POLICY_CHANGED_REVIEW_DECLARATIONS'),
  );
  await fireEvent.press(screen.getByText('Add or edit →'));
  await fireEvent.changeText(
    await screen.findByLabelText(
      'Occupied volume in litres for Used Flowers & Garlands',
    ),
    '3',
  );
  expect(
    await screen.findByText(
      'Weight bands have changed. Please select a current band.',
    ),
  ).toBeTruthy();
  await fireEvent.press(
    await screen.findByRole('radio', {
      name: /Updated small band.*Used Flowers & Garlands/,
    }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Done · return to Review' }),
  );
  await waitFor(() =>
    expect(quote.mock.calls.at(-1)?.[0].policy_revision).toBe(2),
  );
  expect(
    screen.getByRole('checkbox', { name: 'I have reviewed this pickup price' })
      .props.accessibilityState.checked,
  ).toBe(false);
  expect(
    screen.getByRole('button', { name: 'Confirm & Pay →' }).props
      .accessibilityState.disabled,
  ).toBe(true);
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

test.each([true, false])(
  'server-allowed cancellation action also requires deployment compensation=%s',
  async (enabled) => {
    mockCompensationEnabled = enabled;
    const cancel = jest.spyOn(repositories, 'cancel');
    await show(<CollectionDetailScreen />);
    await screen.findByText('Collection scheduled');
    const action = screen.queryByRole('button', { name: 'Cancel pickup' });
    if (enabled) expect(action).toBeTruthy();
    else expect(action).toBeNull();
    expect(screen.queryByText('Cancel this pickup?')).toBeNull();
    expect(cancel).not.toHaveBeenCalled();
  },
);

test('focus refreshes owned payment/detail; manual payment and refund refresh remain independent', async () => {
  mockRequestId = '66666666-6666-4666-8666-666666666660';
  const snapshot = await repositories.detail(mockRequestId);
  const payment = jest.spyOn(repositories, 'payment');
  const refunds = jest.spyOn(repositories, 'refunds');
  await show(<CollectionDetailScreen />);
  await screen.findByText('Refund initiated');
  await waitFor(() => expect(payment).toHaveBeenCalledTimes(1));
  expect(refunds).not.toHaveBeenCalled();
  payment.mockResolvedValue({
    ...snapshot.payment,
    status: 'CONFIRMING',
    action: 'WAIT',
    action_reason: 'VERIFICATION_REQUIRED',
    verification_pending: true,
    retry_allowed: false,
    checkout_ready_until: null,
  });
  await fireEvent.press(
    screen.getByRole('button', { name: 'Refresh payment status' }),
  );
  await screen.findByText('Payment awaiting confirmation');
  refunds.mockResolvedValue({
    refunds: snapshot.refunds.map((refund) => ({
      ...refund,
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
    })),
  });
  await fireEvent.press(
    screen.getByRole('button', { name: 'Refresh refund status' }),
  );
  await screen.findByText('Refund completed');
  expect(payment).toHaveBeenCalledTimes(2);
  expect(refunds).toHaveBeenCalledTimes(1);
  expect((await repositories.detail(mockRequestId)).refunds[0]?.status).toBe(
    'INITIATED',
  );
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
