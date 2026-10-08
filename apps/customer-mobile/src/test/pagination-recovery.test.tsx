import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react-native';
import { useCollections } from '../features/collection/queries';
import NotificationScreen from '../notifications/NotificationScreen';
import { createDevelopmentRepositories } from '../features/collection/developmentRepositories';
import { repositories } from '../lib/repositories';
import { ApiError } from '../api/errors';
import type {
  CollectionSummary,
  NotificationEntry,
  Page,
} from '../api/customer-contracts';
import { Body, Button } from '../components/ui';
jest.setTimeout(20000);
jest.mock('../lib/runtime', () => {
  const state = { userId: 'customer', status: 'authenticated' };
  return {
    session: { subscribe: () => () => {}, getSnapshot: () => state },
    pushLifecycle: { subscribe: () => () => {}, state: () => 'idle' },
  };
});
jest.mock('../lib/repositories', () => ({
  repositories: { collections: jest.fn(), notifications: jest.fn() },
}));
jest.mock('../components/Header', () => ({ Header: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../notifications/integration', () => ({
  permissionState: async () => ({ status: 'granted' }),
  enableNotifications: jest.fn(),
}));

function Collections({ view }: { view: 'active' | 'history' }) {
  const query = useCollections(view);
  return (
    <>
      {query.data?.pages
        .flatMap((page) => page.items)
        .map((item) => (
          <Body key={item.request_id}>{item.title}</Body>
        ))}
      {query.isFetchNextPageError && <Body>Page failed</Body>}
      {query.hasNextPage && (
        <Button
          label="Load more"
          busy={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        />
      )}
    </>
  );
}
let client: QueryClient;
async function show(element: React.ReactNode) {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30000, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  await render(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>,
  );
  await waitFor(() => expect(client.isFetching()).toBe(0));
}
beforeEach(() => jest.resetAllMocks());
afterEach(async () => {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await cleanup();
  client.clear();
});
const expired = () => new ApiError(409, 'http', 'CURSOR_EXPIRED');

test.each(['active', 'history'] as const)(
  '%s cursor expiry discards every old page and resumes from a fresh first page',
  async (view) => {
    const base = (await createDevelopmentRepositories().collections(view, null))
      .items[0]!;
    const page = (
      title: string,
      cursor: string | null,
    ): Page<CollectionSummary> => ({
      items: [{ ...base, request_id: title, title }],
      next_cursor: cursor,
    });
    const read = jest.mocked(repositories.collections);
    read
      .mockResolvedValueOnce(page('Old first', 'page-2'))
      .mockResolvedValueOnce(page('Old second', 'expired-page-3'))
      .mockRejectedValueOnce(expired())
      .mockResolvedValueOnce(page('Fresh first', 'fresh-page-2'))
      .mockResolvedValueOnce(page('Fresh second', null));
    await show(<Collections view={view} />);
    await screen.findByText('Old first');
    await fireEvent.press(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Old second');
    await fireEvent.press(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Fresh first');
    expect(screen.queryByText('Old first')).toBeNull();
    expect(screen.queryByText('Old second')).toBeNull();
    expect(
      client.getQueryData<{ pages: unknown[] }>([
        'collections',
        'customer',
        view,
      ])?.pages,
    ).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Fresh second');
    expect(read.mock.calls.map((call) => call[1])).toEqual([
      null,
      'page-2',
      'expired-page-3',
      null,
      'fresh-page-2',
    ]);
  },
);

const notificationPage = (
  title: string,
  cursor: string | null,
): Page<NotificationEntry> => ({
  items: [
    {
      event_id: title,
      title,
      body: 'Collection update',
      target: 'COLLECTION',
      request_id: '11111111-1111-4111-8111-111111111111',
      created_at: new Date().toISOString(),
    },
  ],
  next_cursor: cursor,
});
test('notification cursor expiry drops the old chain and requests the first page rather than retrying the expired cursor', async () => {
  const read = jest.mocked(repositories.notifications);
  read
    .mockResolvedValueOnce(notificationPage('Old update', 'page-2'))
    .mockResolvedValueOnce(
      notificationPage('Old second update', 'expired-page-3'),
    )
    .mockRejectedValueOnce(expired())
    .mockResolvedValueOnce(notificationPage('Fresh update', 'fresh-page-2'))
    .mockResolvedValueOnce(notificationPage('Fresh second update', null));
  await show(<NotificationScreen />);
  await screen.findByText('Old update');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Load more updates' }),
  );
  await screen.findByText('Old second update');
  await fireEvent.press(
    screen.getByRole('button', { name: 'Load more updates' }),
  );
  await screen.findByText('Fresh update');
  expect(screen.queryByText('Old second update')).toBeNull();
  expect(
    client.getQueryData<{ pages: unknown[] }>(['notifications', 'customer'])
      ?.pages,
  ).toHaveLength(1);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Load more updates' }),
  );
  await screen.findByText('Fresh second update');
  expect(read.mock.calls.map((call) => call[0])).toEqual([
    null,
    'page-2',
    'expired-page-3',
    null,
    'fresh-page-2',
  ]);
});

test.each([new ApiError(0, 'network'), new ApiError(503)])(
  'ordinary collection page failure retains its cursor for retry: %s',
  async (error) => {
    const base = (
      await createDevelopmentRepositories().collections('history', null)
    ).items[0]!;
    const read = jest.mocked(repositories.collections);
    read
      .mockResolvedValueOnce({
        items: [{ ...base, title: 'First pickup' }],
        next_cursor: 'page-2',
      })
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({
        items: [{ ...base, request_id: 'second', title: 'Second pickup' }],
        next_cursor: null,
      });
    await show(<Collections view="history" />);
    await screen.findByText('First pickup');
    await fireEvent.press(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Page failed');
    expect(screen.getByText('First pickup')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Load more' }));
    await screen.findByText('Second pickup');
    expect(read.mock.calls.map((call) => call[1])).toEqual([
      null,
      'page-2',
      'page-2',
    ]);
  },
);

test.each([new ApiError(0, 'network'), new ApiError(503)])(
  'ordinary notification page failure retries the same next page: %s',
  async (error) => {
    const read = jest.mocked(repositories.notifications);
    read
      .mockResolvedValueOnce(notificationPage('First update', 'page-2'))
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(notificationPage('Second update', null));
    await show(<NotificationScreen />);
    await screen.findByText('First update');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Load more updates' }),
    );
    await screen.findByText('Updates unavailable');
    await fireEvent.press(screen.getByRole('button', { name: 'Try again →' }));
    await screen.findByText('Second update');
    expect(read.mock.calls.map((call) => call[0])).toEqual([
      null,
      'page-2',
      'page-2',
    ]);
  },
);
