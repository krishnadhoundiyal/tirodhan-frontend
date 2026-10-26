import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { CustomerApp } from '../customer-app';
import { fixtureRuntime } from '../fixture';
import { createRuntime } from '../runtime';
import { ApiError } from '../parity/api/errors';
import { AuthForm } from '../features/auth-form';
import { NoRefreshSessionError } from '../auth/session';
import type { CollectionSummary } from '../parity/api/customer-contracts';
import {
  harness,
  other,
  owner,
  grantValue,
  response,
  deferred,
} from './helpers';
const button = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));
const link = (name: string) =>
  fireEvent.click(screen.getByRole('link', { name }));
async function journey() {
  history.replaceState(null, '', '/account/addresses');
  const r = fixtureRuntime();
  render(<CustomerApp runtime={r} />);
  button('Enter development customer');
  await screen.findByText('Sample home');
  button('Select address');
  link('Collection catalogue');
  fireEvent.click(
    await screen.findByRole('checkbox', {
      name: 'Select Used Flowers & Garlands',
    }),
  );
  button('Review your collection →');
  await screen.findByRole('heading', { name: 'Review your collection' });
  fireEvent.click(await screen.findByRole('radio', { name: /Light/ }));
  fireEvent.change(
    screen.getByLabelText(
      'Occupied volume in litres for Used Flowers & Garlands',
    ),
    { target: { value: '2.5' } },
  );
  fireEvent.change(
    screen.getByLabelText('Quantity for Used Flowers & Garlands (optional)'),
    { target: { value: '2' } },
  );
  button('Check pickup availability');
  await screen.findByText('Address serviceable. No slot is reserved yet.');
  const price = await screen.findByRole('checkbox', {
    name: 'I have reviewed this current backend price.',
  });
  fireEvent.click(price);
  await waitFor(() =>
    expect(
      document.querySelector<HTMLInputElement>(
        'input[name="slot"]:not(:disabled)',
      ),
    ).toBeTruthy(),
  );
  fireEvent.click(
    document.querySelector<HTMLInputElement>(
      'input[name="slot"]:not(:disabled)',
    )!,
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: 'Reserve capacity and create booking',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  button('Reserve capacity and create booking');
  await screen.findByText('Payment pending');
  return r;
}
test('complete UI booking, callback-only wait, backend payment, cancellation, refund and history journey', async () => {
  const r = await journey();
  expect(r.fixtureProduct.records.size).toBe(1);
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'Provider callback without backend confirmation',
    }),
  );
  button('Continue to secure payment');
  await screen.findByText(
    'Tirodhan is verifying the existing attempt. Do not start another payment.',
  );
  expect(screen.queryByText('Payment received')).toBeNull();
  button('Confirm payment in fixture backend');
  button('Refresh payment status');
  await screen.findByText('Payment received');
  button('Refresh pickup details');
  await screen.findByRole('button', { name: 'Cancel pickup' });
  button('Cancel pickup');
  button('Confirm cancellation');
  await screen.findByText('Refund initiated');
  expect(screen.queryByText('Refund completed')).toBeNull();
  button('Complete fixture refund');
  button('Refresh pickup details');
  await screen.findByText('Refund completed');
  link('Activity');
  fireEvent.click(await screen.findByRole('tab', { name: 'History' }));
  await screen.findByText('CANCELLED');
  button('View collection →');
  await screen.findByText('Refund completed');
  button('Log out');
  await screen.findByRole('button', { name: 'Enter development customer' });
  expect(screen.queryByText('Fictional booking address snapshot')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
test('authoritative handover and receiving point are visible in detail and history', async () => {
  const r = await journey();
  button('Continue to secure payment');
  await screen.findByText('Payment received');
  button('Validate fixture handover');
  button('Refresh pickup details');
  await screen.findByText(
    'Handover validated by Tirodhan. Further processing is shown only when confirmed by the service.',
  );
  expect(screen.getByText('Fictional receiving point')).toBeTruthy();
  expect(r.fixtureProduct.records.size).toBe(1);
  await act(() => r.session.logout());
});
test('backend planning race removes cancellation action without inventing a refund', async () => {
  const r = await journey();
  button('Continue to secure payment');
  await screen.findByRole('button', { name: 'Cancel pickup' });
  r.fixtureProduct.setScenario('PLANNING_RACE');
  button('Cancel pickup');
  button('Confirm cancellation');
  await screen.findByText(
    'This pickup can no longer be cancelled because planning has started.',
  );
  expect(screen.queryByText('Refund initiated')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Cancel pickup' })).toBeNull();
  await act(() => r.session.logout());
});
test('editing an already geocoded address clears coordinates through the rendered form', async () => {
  history.replaceState(null, '', '/account/addresses');
  const r = fixtureRuntime();
  await r.development!.signIn();
  const a = (await r.api.addresses())[0]!;
  await r.api
    .update(a, {
      address: a.address,
      label: a.label,
      is_default: a.is_default,
      location: { latitude: 28, longitude: 77 },
    })
    .execute();
  render(<CustomerApp runtime={r} />);
  await screen.findByText('Sample home');
  button('Edit');
  fireEvent.change(screen.getByLabelText('Complete address'), {
    target: { value: 'Different complete household' },
  });
  expect(
    screen.getByText(/Changing address text removes previous coordinates/),
  ).toBeTruthy();
  button('Save address');
  await screen.findByText('Different complete household');
  expect((await r.api.addresses())[0]?.location).toBeNull();
  await act(() => r.session.logout());
});
test('profile, preferences, favourites, payment methods, feedback, content and history controls work with fixture authority', async () => {
  history.replaceState(null, '', '/account/profile');
  const r = fixtureRuntime();
  await r.development!.signIn();
  render(<CustomerApp runtime={r} />);
  await screen.findByLabelText('Name (optional)');
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: 'Save profile',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.change(screen.getByLabelText('Name (optional)'), {
    target: { value: 'Updated customer' },
  });
  button('Save profile');
  await screen.findByText('Account information saved.');
  link('Language & updates');
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: 'Save preferences',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.change(await screen.findByLabelText('Service language'), {
    target: { value: 'hi-IN' },
  });
  button('Save preferences');
  await screen.findByText('Account information saved.');
  link('Favourites');
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: 'Save favourites',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(
    await screen.findByRole('checkbox', { name: 'Used Flowers & Garlands' }),
  );
  button('Save favourites');
  await screen.findByText('Account information saved.');
  link('Payment methods');
  await screen.findByText(/Secure provider checkout/);
  link('Share feedback');
  fireEvent.change(await screen.findByLabelText('Feedback message'), {
    target: { value: 'Useful fixture message' },
  });
  button('Send feedback');
  await screen.findByText(/Feedback received/);
  link('Help & Support');
  await screen.findByText(/Development information/);
  link('Notifications');
  await screen.findByRole('heading', { name: 'Notifications', level: 2 });
  expect(fetch).not.toHaveBeenCalled();
  await act(() => r.session.logout());
});
test('same missing backend capabilities disable implemented account forms before HTTP', async () => {
  const h = harness();
  await h.login();
  history.replaceState(null, '', '/account/profile');
  render(
    <CustomerApp
      runtime={createRuntime(h.session, { memoryRecovery: true })}
    />,
  );
  await screen.findByRole('heading', { name: 'Your profile', level: 2 });
  expect(
    (screen.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    h.fetcher.mock.calls.filter(([p]) => String(p).includes('/me/profile')),
  ).toHaveLength(0);
  await act(() => h.session.logout());
});
test('account switching hides cached detail and rejects the old prepared command', async () => {
  const h = harness();
  await h.login();
  const r = createRuntime(h.session, { memoryRecovery: true });
  const old = r.customer(),
    gate = deferred<Response>();
  h.fetcher.mockImplementation(async (input) =>
    String(input).endsWith('/me')
      ? response({ user_id: other, roles: ['CUSTOMER'] })
      : gate.promise,
  );
  const pending = old.repo.catalogue();
  h.adapter.verifyOtp = jest.fn(async () => ({
    ...grantValue(),
    user_id: other,
  }));
  await h.session.logout();
  await h.session.login(owner, '123456');
  const fresh = r.customer();
  expect(fresh.owner).toBe(other);
  expect(old.current()).toBe(false);
  expect(fresh.snapshot().codes).toEqual([]);
  gate.resolve(
    response({
      version: 'late',
      groups: [],
      categories: [],
      quick_categories: [],
      artwork: {
        hero: null,
        home: null,
        rickshaw: null,
        receiving_point: null,
      },
    }),
  );
  await expect(pending).rejects.toThrow();
  await h.session.logout();
});

test('expired pagination discards the stale chain and reads a fresh first page', async () => {
  const r = await journey(),
    m = r.customer();
  const d = await m.repo.detail([...r.fixtureProduct.records.keys()][0]!);
  let firstReads = 0;
  const page = jest
    .spyOn(m.repo, 'collections')
    .mockImplementation(async (_view, cursor) => {
      if (cursor) throw new ApiError(409, 'http', 'CURSOR_EXPIRED');
      firstReads++;
      return {
        items: [
          {
            ...d,
            title:
              firstReads === 1 ? 'Stale page title' : 'Recovered page title',
          } as CollectionSummary,
        ],
        next_cursor: firstReads === 1 ? 'expired' : null,
      };
    });
  link('Activity');
  await screen.findByText('Stale page title');
  button('Load more collections');
  await screen.findByText('Recovered page title');
  expect(screen.queryByText('Stale page title')).toBeNull();
  expect(page.mock.calls.filter(([, cursor]) => cursor === null).length).toBe(
    2,
  );
  expect(
    screen.queryByRole('button', { name: 'Load more collections' }),
  ).toBeNull();
  await act(() => r.session.logout());
});
test('browser auth controls use challenge, resend and CUSTOMER admission without raw auth HTTP', async () => {
  const h = harness(),
    r = createRuntime(h.session);
  render(<AuthForm runtime={r} />);
  fireEvent.change(screen.getByLabelText('Mobile number · +91'), {
    target: { value: '9999999999' },
  });
  button('Send verification code');
  await screen.findByLabelText('Six digit verification code');
  button('Resend code');
  await waitFor(() => expect(h.adapter.startOtp).toHaveBeenCalledTimes(2));
  fireEvent.change(screen.getByLabelText('Six digit verification code'), {
    target: { value: '123456' },
  });
  button('Verify and sign in');
  await waitFor(() => expect(h.session.snapshot().phase).toBe('ready'));
  expect(
    h.fetcher.mock.calls.every(([path]) =>
      String(path).endsWith('/v1/auth/me'),
    ),
  ).toBe(true);
  await act(() => h.session.logout());
});

test('location attachment confirmation is bound to exact coordinates as well as address text', async () => {
  history.replaceState(null, '', '/account/addresses');
  const r = fixtureRuntime();
  await r.development!.signIn();
  const m = r.customer();
  m.setLocation({ latitude: 28, longitude: 77 });
  render(<CustomerApp runtime={r} />);
  await screen.findByText('Sample home');
  fireEvent.click(screen.getByRole('button', { name: /Add an address/ }));
  fireEvent.change(screen.getByLabelText('Complete address'), {
    target: { value: 'Confirmed new household' },
  });
  const attach = screen.getByRole('checkbox', {
    name: 'Attach the explicitly selected location to this exact address',
  });
  fireEvent.click(attach);
  expect((attach as HTMLInputElement).checked).toBe(true);
  await act(async () => {
    m.setLocation({ latitude: 29, longitude: 78 });
  });
  expect((attach as HTMLInputElement).checked).toBe(false);
  button('Save address');
  await screen.findByText('Confirmed new household');
  expect(
    (await r.api.addresses()).find(
      (a) => a.address === 'Confirmed new household',
    )?.location,
  ).toBeNull();
  await act(() => r.session.logout());
});
test('late geocoder search cannot replace a newly edited location intent', async () => {
  history.replaceState(null, '', '/account/addresses');
  const r = fixtureRuntime();
  await r.development!.signIn();
  const m = r.customer(),
    result =
      deferred<
        { location: { latitude: number; longitude: number }; address: string }[]
      >();
  m.options.geocoder = {
    search: () => result.promise,
    reverse: async () => null,
  };
  render(<CustomerApp runtime={r} />);
  await screen.findByText('Sample home');
  fireEvent.change(screen.getByLabelText('Search area, landmark or address'), {
    target: { value: 'Old landmark' },
  });
  button('Search location');
  fireEvent.change(screen.getByLabelText('Search area, landmark or address'), {
    target: { value: 'New landmark' },
  });
  await act(async () => {
    result.resolve([
      { location: { latitude: 28, longitude: 77 }, address: 'Stale result' },
    ]);
    await result.promise;
  });
  expect(m.snapshot().currentLocation).toBeNull();
  expect(screen.queryByText('Stale result')).toBeNull();
  await act(() => r.session.logout());
});

test('explicitly resumable backend START/CHECKOUT_READY reopens the same owned attempt after dismissal', async () => {
  const r = await journey(),
    m = r.customer();
  r.fixtureProduct.setCallbackOnly(true);
  const launch = jest.spyOn(m.options.checkout!, 'launch');
  button('Continue to secure payment');
  await screen.findByText(
    'Tirodhan is verifying the existing attempt. Do not start another payment.',
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole('button', {
          name: 'Refresh payment status',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  const d = [...r.fixtureProduct.records.values()][0]!;
  d.payment.action = 'START';
  d.payment.action_reason = 'CHECKOUT_READY';
  button('Refresh payment status');
  await screen.findByRole('button', { name: 'Resume secure payment' });
  button('Resume secure payment');
  await waitFor(() => expect(launch).toHaveBeenCalledTimes(2));
  expect(r.fixtureProduct.attempts.size).toBe(1);
  expect(screen.queryByText('Payment received')).toBeNull();
  await act(() => r.session.logout());
});

test('confirmed gateway logout with failed auxiliary cleanup offers local retry without misreporting revocation', async () => {
  history.replaceState(null, '', '/account/addresses');
  const r = fixtureRuntime();
  await r.development!.signIn();
  jest
    .spyOn(r.customer().notifications, 'revoke')
    .mockRejectedValueOnce(Error('Private notification failure'))
    .mockResolvedValue(undefined);
  render(<CustomerApp runtime={r} />);
  await screen.findByText('Sample home');
  button('Log out');
  await screen.findByText(
    'Gateway sign-out is confirmed. Local recovery cleanup is still pending; complete it before starting a new session.',
  );
  expect(r.session.snapshot().logoutUnconfirmed).toBe(false);
  expect(
    screen.queryByRole('button', { name: 'Enter development customer' }),
  ).toBeNull();
  expect(screen.queryByText('Sample home')).toBeNull();
  button('Retry local cleanup');
  await screen.findByRole('button', { name: 'Enter development customer' });
  expect(r.session.snapshot().cleanupPending).toBe(false);
});

test('authoritatively absent cookie session returns the browser UI to OTP without requiring sign-out', async () => {
  history.replaceState(null, '', '/account');
  const h = harness();
  jest
    .mocked(h.adapter.refresh)
    .mockRejectedValueOnce(new NoRefreshSessionError());
  const r = createRuntime(h.session, { memoryRecovery: true });
  render(<CustomerApp runtime={r} />);
  button('Restore secure browser session');
  await waitFor(() => expect(h.session.snapshot().phase).toBe('signedOut'));
  expect(h.session.snapshot().logoutUnconfirmed).toBe(false);
  expect(screen.queryByRole('button', { name: 'Retry sign-out' })).toBeNull();
  expect(
    (screen.getByLabelText('Mobile number · +91') as HTMLInputElement).closest(
      'fieldset',
    )?.disabled,
  ).toBe(false);
  fireEvent.change(screen.getByLabelText('Mobile number · +91'), {
    target: { value: '9999999999' },
  });
  button('Send verification code');
  await screen.findByLabelText('Six digit verification code');
  expect(h.adapter.logout).not.toHaveBeenCalled();
});
