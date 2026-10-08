import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react-native';
import MediaImage, { mediaSource } from '../features/media/MediaImage';
import Recommendations, {
  recommendedCategories,
} from '../features/home/Recommendations';
import { DraftProvider } from '../features/collection/DraftProvider';
import {
  developmentCatalogue,
  developmentMedia,
} from '../features/collection/developmentCatalogue';
import { repositories } from '../lib/repositories';
import { catalogueFreshness } from '../features/collection/catalogue';
jest.mock('../lib/runtime', () => {
  const snapshot = { userId: 'customer' };
  return {
    previewCatalogue: true,
    session: { subscribe: () => () => {}, getSnapshot: () => snapshot },
  };
});
jest.mock('../lib/repositories', () => ({
  repositories: { recommendations: jest.fn() },
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-image', () => {
  const React = jest.requireActual('react'),
    { View } = jest.requireActual('react-native');
  return {
    Image: (props: object) =>
      React.createElement(View, { ...props, testID: 'remote-image' }),
  };
});
afterEach(async () => {
  await cleanup();
});
const remote = {
  ...developmentMedia('flowers', 'Flowers and garlands'),
  url: 'https://cdn.example/flowers.webp',
  thumbnail_url: 'https://cdn.example/flowers-small.webp',
};
test('remote source contains HTTPS URL only; local assets are restricted to explicit development fallback', () => {
  expect(mediaSource(remote, false)).toEqual({ uri: remote.url });
  expect(mediaSource(remote, false, true)).toEqual({
    uri: remote.thumbnail_url,
  });
  expect(
    mediaSource(developmentMedia('flowers', 'Flowers'), false),
  ).toBeUndefined();
  expect(
    mediaSource(developmentMedia('flowers', 'Flowers'), true),
  ).toBeDefined();
});
test('failed remote image preserves fixed layout and exposes safe accessible fallback', async () => {
  await render(
    <MediaImage media={remote} style={{ width: 160, height: 90 }} />,
  );
  await fireEvent(screen.getByTestId('remote-image'), 'error');
  expect(screen.getByText('Image unavailable')).toBeTruthy();
  expect(screen.queryByTestId('remote-image')).toBeNull();
  expect(screen.getByLabelText('Flowers and garlands')).toBeTruthy();
});
test('recommendation join keeps ranked known active historical codes and does not fabricate fallback', () => {
  expect(
    recommendedCategories(developmentCatalogue, { recommendations: [] }),
  ).toEqual([]);
  expect(recommendedCategories(developmentCatalogue, undefined)).toEqual([]);
  expect(
    recommendedCategories(developmentCatalogue, {
      recommendations: [
        { category_code: 'unknown', rank: 0, reason: 'PREVIOUS_COLLECTION' },
        { category_code: 'books', rank: 2, reason: 'PREVIOUS_COLLECTION' },
        { category_code: 'flowers', rank: 1, reason: 'PREVIOUS_COLLECTION' },
        { category_code: 'flowers', rank: 3, reason: 'PREVIOUS_COLLECTION' },
      ],
    }).map((item) => item.code),
  ).toEqual(['flowers', 'books']);
});
test('recommendations render exact historical heading and hide whole section after empty or unavailable response', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  jest.mocked(repositories.recommendations).mockResolvedValue({
    recommendations: [
      { category_code: 'flowers', rank: 1, reason: 'PREVIOUS_COLLECTION' },
    ],
  });
  await render(
    <QueryClientProvider client={client}>
      <DraftProvider>
        <Recommendations catalogue={developmentCatalogue} />
      </DraftProvider>
    </QueryClientProvider>,
  );
  expect(
    await screen.findByText('Based on your previous collections'),
  ).toBeTruthy();
  expect(
    screen.getByLabelText('Book pickup for Used Flowers & Garlands'),
  ).toBeTruthy();
  jest
    .mocked(repositories.recommendations)
    .mockResolvedValue({ recommendations: [] });
  await client.invalidateQueries({ queryKey: ['recommendations'] });
  await waitFor(() =>
    expect(screen.queryByText('Based on your previous collections')).toBeNull(),
  );
  jest
    .mocked(repositories.recommendations)
    .mockRejectedValue(new Error('private'));
  await client.invalidateQueries({ queryKey: ['recommendations'] });
  await waitFor(() =>
    expect(screen.queryByText('Based on your previous collections')).toBeNull(),
  );
  await cleanup();
  client.clear();
});
test('expired signed media is not loaded and catalogue freshness is bounded by its earliest expiry', () => {
  const now = Date.now();
  expect(
    mediaSource(
      { ...remote, expires_at: new Date(now - 1).toISOString() },
      false,
    ),
  ).toBeUndefined();
  const catalogue = {
    ...developmentCatalogue,
    artwork: {
      ...developmentCatalogue.artwork,
      hero: { ...remote, expires_at: new Date(now + 12000).toISOString() },
    },
  };
  expect(catalogueFreshness(catalogue, now)).toBe(12000);
  expect(catalogueFreshness(catalogue, now + 13000)).toBe(0);
});
