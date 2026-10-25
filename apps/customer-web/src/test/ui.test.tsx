import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { PublicPage, metadata, publicPaths } from '../public';
import { CustomerApp } from '../customer-app';
import { fixtureRuntime } from '../fixture';
import { productionRuntime } from '../runtime';
import { harness, response } from './helpers';
import { createRuntime } from '../runtime';

beforeEach(() => {
  history.replaceState(null, '', '/account/addresses');
});
async function enter() {
  const runtime = fixtureRuntime();
  render(<CustomerApp runtime={runtime} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'Enter development customer' }),
  );
  await screen.findByText('Sample home');
  return runtime;
}
test.each(publicPaths)(
  'public route %s has one h1, navigation and meaningful metadata',
  (path) => {
    render(<PublicPage path={path} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('navigation', { name: 'Footer navigation' }),
    ).toBeTruthy();
    expect(metadata(path).description.length).toBeGreaterThan(40);
  },
);
test('public links go to informative availability gate, with no fake booking action', () => {
  render(<PublicPage path="/availability" />);
  expect(screen.getByText('Online booking is not yet activated.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /book pickup/i })).toBeNull();
});
test('production account is gated with zero network, no fixture login', () => {
  render(<CustomerApp runtime={productionRuntime()} />);
  expect(screen.getByText('Online booking is not yet activated.')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Enter development customer' }),
  ).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
test('fixture can create, edit, select, check and archive saved address without live fetch', async () => {
  const runtime = await enter();
  fireEvent.click(screen.getByRole('button', { name: /add an address/i }));
  expect(document.activeElement?.textContent).toBe('Add a new address');
  fireEvent.change(screen.getByLabelText(/Address label/), {
    target: { value: 'Temple' },
  });
  fireEvent.change(screen.getByLabelText('Complete address'), {
    target: { value: 'Example new address' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save address' }));
  await waitFor(() =>
    expect(
      screen.getByText('Example new address').closest('article'),
    ).toBeTruthy(),
  );
  let card = screen.getByText('Example new address').closest('article')!;
  fireEvent.click(within(card).getByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByLabelText('Complete address'), {
    target: { value: 'Updated example address' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save address' }));
  await waitFor(() =>
    expect(
      screen.getByText('Updated example address').closest('article'),
    ).toBeTruthy(),
  );
  card = screen.getByText('Updated example address').closest('article')!;
  fireEvent.click(within(card).getByRole('button', { name: 'Select address' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Check selected address' }),
  );
  await screen.findByText(
    'This address is serviceable. No collection slot or time is confirmed.',
  );
  fireEvent.click(within(card).getByRole('button', { name: 'Archive' }));
  expect(document.activeElement?.textContent).toBe('Archive Temple?');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm archive' }));
  await waitFor(() =>
    expect(screen.queryByText('Updated example address')).toBeNull(),
  );
  expect(
    screen.queryByText(
      'This address is serviceable. No collection slot or time is confirmed.',
    ),
  ).toBeNull();
  await act(() => runtime.session.logout());
  expect(fetch).not.toHaveBeenCalled();
});
test.each([
  ['UNSERVICEABLE', 'This address is currently unserviceable.'],
  [
    'TECHNICAL_FAILURE',
    'The address check could not be completed. No coverage is confirmed.',
  ],
  ['EXPIRED', 'This check has expired. Start a new check.'],
  [
    'UNAVAILABLE',
    'The service is unavailable. Please try again when you are ready.',
  ],
])('fixture check scenario %s', async (scenario, message) => {
  await enter();
  fireEvent.click(screen.getByRole('button', { name: 'Select address' }));
  fireEvent.change(screen.getByLabelText('Development check scenario'), {
    target: { value: scenario },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Check selected address' }),
  );
  await screen.findByText(message);
});
test('pending check needs explicit read; changing selected address invalidates result', async () => {
  await enter();
  fireEvent.click(screen.getByRole('button', { name: 'Select address' }));
  fireEvent.change(screen.getByLabelText('Development check scenario'), {
    target: { value: 'PENDING' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Check selected address' }),
  );
  await screen.findByRole('button', { name: 'Read latest result' });
  fireEvent.change(screen.getByLabelText('Development check scenario'), {
    target: { value: 'SERVICEABLE' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Read latest result' }));
  await screen.findByText(
    'This address is serviceable. No collection slot or time is confirmed.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Select address' }));
  expect(
    screen.queryByText(
      'This address is serviceable. No collection slot or time is confirmed.',
    ),
  ).toBeNull();
});
test('customer account logout removes protected data immediately', async () => {
  await enter();
  fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
  expect(screen.queryByText('Sample home')).toBeNull();
  await screen.findByRole('button', { name: 'Enter development customer' });
});
test('unknown household backend details are redacted; stale data is hidden after read error', async () => {
  const h = harness();
  await h.login();
  h.fetcher.mockResolvedValue(
    response([
      {
        address_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        address: 'Private old address',
        label: 'House',
        location: null,
        is_default: false,
        status: 'ACTIVE',
        version: 1,
      },
    ]),
  );
  render(<CustomerApp runtime={createRuntime(h.session)} />);
  await screen.findByText('Private old address');
  h.fetcher.mockResolvedValue(
    response({ detail: 'unsafe-secret-provider-detail' }, 503),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reload addresses' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('Private old address')).toBeNull();
  expect(document.body.textContent).not.toContain(
    'unsafe-secret-provider-detail',
  );
});
test('uncertain save locks inputs and keeps same command across account navigation', async () => {
  const h = harness();
  await h.login();
  h.fetcher.mockResolvedValue(response([]));
  render(<CustomerApp runtime={createRuntime(h.session)} />);
  await screen.findByText('No saved addresses yet. Add one to begin.');
  fireEvent.click(screen.getByRole('button', { name: /add an address/i }));
  fireEvent.change(screen.getByLabelText('Complete address'), {
    target: { value: 'New private house' },
  });
  h.fetcher.mockRejectedValue(new Error('network'));
  fireEvent.click(screen.getByRole('button', { name: 'Save address' }));
  await screen.findByRole('button', { name: 'Retry identical save' });
  expect(
    (screen.getByLabelText('Complete address') as HTMLTextAreaElement).closest(
      'fieldset',
    )?.disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('link', { name: 'Account overview' }));
  fireEvent.click(screen.getByRole('link', { name: 'Saved addresses' }));
  fireEvent.click(screen.getByRole('button', { name: 'Retry identical save' }));
  await waitFor(() =>
    expect(
      h.fetcher.mock.calls.filter((c) => c[1]?.method === 'POST'),
    ).toHaveLength(2),
  );
  const writes = h.fetcher.mock.calls.filter((c) => c[1]?.method === 'POST');
  expect(writes[0][1]?.body).toBe(writes[1][1]?.body);
  expect(writes[0][1]?.headers).toEqual(writes[1][1]?.headers);
});
