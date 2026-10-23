import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from '@testing-library/react-native';
import { AppState, Text, type AppStateStatus } from 'react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { Admission } from '../features/Admission';
import Home from '../features/Home';
import Offers from '../features/Offers';
import Assignment from '../features/Assignment';
import Login from '../features/Login';
import { createOperations, type Operations } from '../features/operations';
import { fixtureOwner } from '../features/fixtures';
import { fixtures, queryClient, session, auth } from '../runtime';
import type { SessionSnapshot } from '../session/store';
import {
  createExecutionService,
  type ExecutionService,
} from '../features/execution/service';
import { memoryJournal } from '../features/execution/journal';
let mockOperations: Operations;
let mockExecution: ExecutionService;
let mockState: SessionSnapshot;
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    useFocusEffect: (callback: () => void) =>
      React.useEffect(callback, [callback]),
    useRouter: () => ({ push: mockPush }),
    Redirect: ({ href }: { href: string }) =>
      React.createElement(Text, null, `Redirect ${href}`),
  };
});
jest.mock('../runtime', () => {
  const { QueryClient } = jest.requireActual('@tanstack/react-query');
  const { createFixtureRepository } = jest.requireActual(
    '../features/fixtures',
  );
  return {
    preview: false,
    nativeAuth: true,
    queryClient: new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false, gcTime: Infinity },
      },
    }),
    fixtures: createFixtureRepository(),
    operationsForSession: () => mockOperations,
    executionForSession: () => mockExecution,
    session: {
      getSnapshot: () => mockState,
      subscribe: () => () => {},
      loadPrincipal: jest.fn(),
    },
    recheckSession: jest.fn(),
    logout: jest.fn(),
    auth: { start: jest.fn(), verify: jest.fn(), clear: jest.fn() },
  };
});
jest.setTimeout(20000);
const listeners = new Set<(state: AppStateStatus) => void>();
beforeEach(() => {
  jest.clearAllMocks();
  mockState = {
    status: 'authenticated',
    userId: fixtureOwner,
    principal: { userId: fixtureOwner, roles: ['RIDER'] },
    principalState: 'available',
    principalError: null,
    ownerVersion: 1,
  };
  fixtures.setScenario('offers');
  mockOperations = createOperations(fixtures.repository, queryClient, {
    owner: fixtureOwner,
    key: ['screens'],
    current: () => true,
    onForbidden: async () => {},
  });
  let commandId = 0;
  mockExecution = createExecutionService(
    fixtures.execution,
    memoryJournal(),
    queryClient,
    mockOperations,
    {
      owner: fixtureOwner,
      current: () => true,
      uuid: () => `demo-ui-command-${++commandId}`,
    },
  );
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    value: 'active',
  });
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    });
});
afterEach(async () => {
  await cleanup();
  await queryClient.cancelQueries();
  queryClient.clear();
  listeners.clear();
  jest.restoreAllMocks();
});
const mount = (element: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
  );
test('direct Rider route redirects signed-out users and denies CUSTOMER/MANAGER', async () => {
  mockState = { ...mockState, status: 'signedOut', principal: null };
  const result = await mount(
    <Admission>
      <Text>Private Rider data</Text>
    </Admission>,
  );
  expect(screen.getByText('Redirect /')).toBeTruthy();
  mockState = {
    ...mockState,
    status: 'authenticated',
    principal: { userId: fixtureOwner, roles: ['CUSTOMER', 'MANAGER'] },
  };
  await result.rerender(
    <QueryClientProvider client={queryClient}>
      <Admission>
        <Text>Private Rider data</Text>
      </Admission>
    </QueryClientProvider>,
  );
  expect(screen.getByText('Rider access required')).toBeTruthy();
  expect(screen.queryByText('Private Rider data')).toBeNull();
});
test('home updates availability with the server version and separate work state', async () => {
  const put = jest.spyOn(fixtures.repository, 'setAvailability');
  await mount(<Home />);
  await screen.findByText('Work state: IDLE');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Request offline' }),
  );
  await screen.findByText('Availability intent: OFFLINE');
  expect(put).toHaveBeenCalledWith('OFFLINE', 1);
  expect(screen.getByText('Work state: IDLE')).toBeTruthy();
});
test('offer acceptance opens authoritative active work after the assignment read', async () => {
  const accept = jest.spyOn(fixtures.repository, 'accept');
  await mount(<Offers />);
  await screen.findByRole('button', { name: 'Accept offer' });
  await fireEvent.press(screen.getByRole('button', { name: 'Accept offer' }));
  await waitFor(() =>
    expect(mockPush).toHaveBeenCalledWith('/(rider)/assignment'),
  );
  expect(accept).toHaveBeenCalledTimes(1);
  expect(
    queryClient.getQueryData(mockOperations.key('assignment')),
  ).toMatchObject({ assignment: { assignment_id: 'demo-assignment' } });
});
test('expired offer is readable but cannot be accepted', async () => {
  fixtures.setScenario('expired');
  await mount(<Offers />);
  const button = await screen.findByRole('button', { name: 'Accept offer' });
  expect(button.props.accessibilityState.disabled).toBe(true);
  expect(screen.getByText(/Expired locally/)).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
});
test('assignment and route absence are distinct empty states', async () => {
  fixtures.setScenario('empty');
  await mount(<Assignment />);
  await screen.findByText('No active assignment');
  expect(
    await screen.findByText(/No V2 route is currently exposed/),
  ).toBeTruthy();
});
test('active work includes pickup address/window and server route order', async () => {
  fixtures.setScenario('active');
  await mount(<Assignment />);
  await screen.findByText('Assignment demo-assignment');
  expect(await screen.findByText('1. PICKUP · PENDING')).toBeTruthy();
  expect(screen.getByText(/Development fixture pickup/)).toBeTruthy();
});
test('foreground return refreshes manager-changed work without periodic polling', async () => {
  fixtures.setScenario('active');
  await mount(<Assignment />);
  await screen.findByText('Assignment demo-assignment');
  await act(async () => {
    listeners.forEach((listener) => listener('background'));
  });
  fixtures.setScenario('empty');
  await act(async () => {
    listeners.forEach((listener) => listener('active'));
  });
  await screen.findByText('No active assignment');
  expect(screen.queryByText('Assignment demo-assignment')).toBeNull();
});
test('OTP UI calls the auth flow without passing codes through navigation', async () => {
  mockState = {
    ...mockState,
    status: 'signedOut',
    principal: null,
    principalState: 'idle',
  };
  await mount(<Login />);
  await fireEvent.changeText(
    screen.getByLabelText('Phone number including country code'),
    '+919999999999',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Send verification code' }),
  );
  await screen.findByLabelText('One-time verification code');
  expect(auth.start).toHaveBeenCalledWith('+919999999999');
  await fireEvent.changeText(
    screen.getByLabelText('One-time verification code'),
    '123456',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Verify and sign in' }),
  );
  await waitFor(() => expect(auth.verify).toHaveBeenCalledWith('123456'));
  expect(session.getSnapshot().status).toBe('signedOut');
  expect(mockPush).not.toHaveBeenCalled();
});
async function pressReady(title: string) {
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: title }).props.accessibilityState
        .disabled,
    ).toBe(false),
  );
  await fireEvent.press(screen.getByRole('button', { name: title }));
}
async function confirmAction(title: string) {
  await pressReady(title);
  await pressReady('Confirm and submit');
  await screen.findByText('Backend command receipt');
}
async function closeReceipt() {
  await pressReady('Review complete · continue');
  await waitFor(() =>
    expect(screen.queryByText('Backend command receipt')).toBeNull(),
  );
}
test('V1 execution UI starts assignment and records unsuccessful attempt separately from incident', async () => {
  fixtures.setScenario('execution-v1');
  await mount(<Assignment />);
  await confirmAction('Start assignment');
  await closeReceipt();
  await confirmAction('Record unsuccessful attempt');
  expect(
    screen.getByText(/Backend recorded attempt: NOT_COLLECTED/),
  ).toBeTruthy();
  await closeReceipt();
  await confirmAction('Report incident: CUSTOMER_UNAVAILABLE');
  expect(screen.getByText(/Incident recorded: OPEN/)).toBeTruthy();
  expect(screen.queryByText('No active assignment')).toBeNull();
});
test('V2 execution UI uses ordered route commands and gates discharge/evidence instead of legacy fallback', async () => {
  fixtures.setScenario('execution-v2');
  await mount(<Assignment />);
  await confirmAction('Confirm receipt of this route');
  await closeReceipt();
  expect(screen.queryByRole('button', { name: 'Start assignment' })).toBeNull();
  await pressReady('Depart for next pickup');
  expect(screen.getByText(/Request departure before setting out/)).toBeTruthy();
  await pressReady('Confirm and submit');
  await screen.findByText('Backend command receipt');
  await closeReceipt();
  await confirmAction('Start next pickup at location');
  await closeReceipt();
  await confirmAction('Confirm collected route pickup');
  await closeReceipt();
  await screen.findByText(/Discharge requires cargo\/receiving-point scans/);
  expect(
    screen.queryByRole('button', { name: 'Confirm collected route pickup' }),
  ).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Record unsuccessful attempt' }),
  ).toBeNull();
});
test('V2 vehicle issue displays recovery and never presents new pickup completion', async () => {
  fixtures.setScenario('execution-v2');
  await mount(<Assignment />);
  await confirmAction('Report vehicle issue: SAFETY');
  await closeReceipt();
  await screen.findByText(/Route recovery required/);
  expect(
    screen.queryByRole('button', { name: 'Start next pickup at location' }),
  ).toBeNull();
});
test('secure recovery loading can be retried explicitly without submitting an operation', async () => {
  fixtures.setScenario('execution-v1');
  jest
    .spyOn(mockExecution, 'load')
    .mockRejectedValueOnce(new Error('storage unavailable'));
  await mount(<Assignment />);
  await pressReady('Retry recovery loading');
  await pressReady('Start assignment');
  expect(
    screen.getByRole('button', { name: 'Confirm and submit' }),
  ).toBeTruthy();
  expect(await mockExecution.load()).toBeNull();
});
test('manual operational refresh does not cancel an in-flight secure recovery read', async () => {
  fixtures.setScenario('execution-v1');
  let release!: (value: null) => void;
  const pending = new Promise<null>((done) => {
    release = done;
  });
  jest.spyOn(mockExecution, 'load').mockReturnValueOnce(pending);
  let refreshed!: () => void;
  const completed = new Promise<void>((done) => {
    refreshed = done;
  });
  const refresh = mockOperations.refresh;
  jest.spyOn(mockOperations, 'refresh').mockImplementation(async () => {
    await refresh();
    refreshed();
  });
  await mount(<Assignment />);
  await pressReady('Refresh assignment and route');
  await completed;
  release(null);
  await pressReady('Start assignment');
  expect(
    screen.getByRole('button', { name: 'Confirm and submit' }),
  ).toBeTruthy();
});
