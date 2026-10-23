import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react-native';
import { AppState } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EvidenceScreen from '../features/evidence/EvidenceScreen';
import { createFixtureRepository } from '../features/fixtures';
import { createFieldFixtures } from '../features/evidence/fixtures';
import {
  createEvidenceService,
  type EvidenceService,
} from '../features/evidence/service';
import { memoryEvidenceStore } from '../features/evidence/store';
import { createOperations, type Operations } from '../features/operations';
import { measuredLocation } from '../features/evidence/location';
import type { MediaVault, EvidenceApi } from '../features/evidence/contracts';
let mockPreview = true,
  mockGo = false;
let mockService: EvidenceService,
  mockVault: MediaVault,
  mockOperations: Operations;
let mockClient: QueryClient;
const mockCamera = jest.fn();
const mockAccess = jest.fn(() => mockService);
jest.mock('../runtime', () => ({
  get preview() {
    return mockPreview;
  },
  evidenceForSession: () => mockAccess(),
  evidenceVault: () => mockVault,
  operationsForSession: () => mockOperations,
  get queryClient() {
    return mockClient;
  },
  session: {
    requestIdentity: () => 'identity',
    getSnapshot: () => ({ userId: 'rider' }),
  },
}));
jest.mock('expo', () => ({
  ...jest.requireActual('expo'),
  isRunningInExpoGo: () => mockGo,
}));
jest.mock('expo-crypto', () => {
  let id = 0;
  return { randomUUID: () => `screen-uuid-${++id}` };
});
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    useFocusEffect: (callback: () => void) =>
      React.useEffect(callback, [callback]),
  };
});
jest.mock('../features/evidence/CaptureSheet', () => ({
  __esModule: true,
  default: () => {
    mockCamera();
    return null;
  },
}));
jest.mock('../features/evidence/location', () => ({
  measuredLocation: jest.fn(),
}));
const clients: QueryClient[] = [];
async function show(v2 = false) {
  const fixture = createFixtureRepository();
  fixture.setScenario(v2 ? 'execution-v2' : 'execution-v1');
  const assignment = (await fixture.repository.assignment()).assignment!;
  assignment.pickups[0]!.status = 'COLLECTED';
  const route = await fixture.repository.route();
  if (route) {
    route.tasks[0]!.state = 'COMPLETED';
    route.tasks[1]!.state = 'STARTED';
  }
  const repository = {
    ...fixture.repository,
    assignment: async () => ({ assignment }),
    route: async () => route,
  };
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  clients.push(client);
  mockClient = client;
  mockOperations = createOperations(repository, client, {
    key: ['evidence-screens'],
    owner: 'rider',
    current: () => true,
    onForbidden: async () => {},
  });
  const field = createFieldFixtures(() => {});
  mockVault = field.vault;
  const send = jest.fn(field.api.send);
  const api: EvidenceApi = { ...field.api, send };
  mockService = createEvidenceService(
    api,
    memoryEvidenceStore(),
    field.vault,
    field.upload,
    {
      owner: 'rider',
      current: () => true,
      uuid: (() => {
        let id = 0;
        return () => `screen-id-${++id}`;
      })(),
      fresh: async () => ({ assignment, route }),
      refresh: async () => {
        await client.invalidateQueries();
      },
      executionPending: async () => false,
    },
  );
  await render(
    <QueryClientProvider client={client}>
      <EvidenceScreen />
    </QueryClientProvider>,
  );
  await screen.findByText('Fixture receiving point');
  await screen.findByText(`Pickup demo-pickup · ${v2 ? 'V2' : 'V1'}`);
  return { send, api };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockPreview = true;
  mockGo = false;
  Object.defineProperty(AppState, 'currentState', {
    value: 'active',
    configurable: true,
  });
});
afterEach(async () => {
  await cleanup();
  for (const client of clients) {
    await client.cancelQueries();
    client.clear();
  }
  clients.length = 0;
  jest.restoreAllMocks();
});

test('preview V1 handover requires a destination and confirmation and never invokes hardware', async () => {
  const { send } = await show();
  expect(
    screen.getByRole('button', { name: 'Record V1 handover demo-pickup' }),
  ).toBeDisabled();
  await fireEvent.press(screen.getByText('Fixture receiving point'));
  await fireEvent.press(screen.getByText('Record V1 handover demo-pickup'));
  expect(send).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByText('Confirm with isolated fixture media'),
  );
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  await screen.findByText(/Backend handover: VALIDATED/);
  expect(mockCamera).not.toHaveBeenCalled();
  expect(measuredLocation).not.toHaveBeenCalled();
  expect(send.mock.calls.map(([c]) => c.kind)).toEqual(['HANDOVER', 'CAPTURE']);
});

test('routed discharge is gated by both scans and never exposes a V1 handover control', async () => {
  const { send } = await show(true);
  expect(screen.queryByText('Record V1 handover demo-pickup')).toBeNull();
  await fireEvent.press(screen.getByText('Fixture receiving point'));
  const discharge = () =>
    screen.getByRole('button', { name: 'Record V2 physical discharge' });
  expect(discharge()).toBeDisabled();
  await fireEvent.press(screen.getByText('Scan pickup label'));
  expect(discharge()).toBeDisabled();
  await fireEvent.press(screen.getByText('Scan receiving-point label'));
  expect(discharge()).toBeEnabled();
  await fireEvent.press(discharge());
  await fireEvent.press(
    screen.getByText('Confirm with isolated fixture media'),
  );
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  expect(send.mock.calls[0]?.[0].kind).toBe('DISCHARGE');
  await screen.findByText(/Media attachment is unavailable/);
  expect(measuredLocation).not.toHaveBeenCalled();
});

test('Expo Go live evidence stays isolated without opening private recovery or camera', async () => {
  mockPreview = false;
  mockGo = true;
  await render(<EvidenceScreen />);
  await screen.findByText(/Use the Rider development build/);
  expect(mockAccess).not.toHaveBeenCalled();
  expect(mockCamera).not.toHaveBeenCalled();
});
