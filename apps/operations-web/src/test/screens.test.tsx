import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import App from '../App';
import { fixtureId, fixtureRuntime, scenarios } from '../preview/fixtures';
import { createRuntime, unavailableRuntime } from '../runtime';
import { harness, response } from './helpers';

async function preview(
  scenario: (typeof scenarios)[number] = 'Normal workload',
) {
  const runtime = fixtureRuntime(scenario);
  await runtime.session.restore();
  render(<App runtime={runtime} />);
  await screen.findByRole('heading', { name: 'Operations overview' });
  return runtime;
}
test('production boundary has no credential form or unauthenticated operational reads', () => {
  const runtime = unavailableRuntime('https://gateway.example', {
    dispatch: true,
    fleet: true,
    orchestration: true,
  });
  render(<App runtime={runtime} />);
  expect(
    screen.getByRole('heading', {
      name: 'Web authentication is not yet available',
    }),
  ).toBeTruthy();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByRole('navigation')).toBeNull();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  runtime.dispose();
});
test.each(['CUSTOMER', 'RIDER'])(
  'a %s principal cannot enter the manager app',
  async (role) => {
    const { session } = harness([role]);
    await session.restore();
    const runtime = createRuntime('verified-adapter', session, {
      dispatch: true,
      fleet: true,
      orchestration: true,
    });
    render(<App runtime={runtime} />);
    expect(screen.getByText('Manager access required')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
    runtime.dispose();
  },
);
test('overview labels capped scopes and contains no operational command buttons', async () => {
  const runtime = await preview();
  expect(await screen.findByText('riders in this response')).toBeTruthy();
  expect(screen.getByText(/first 100 riders in ID order/)).toBeTruthy();
  expect(screen.getByText(/not a global total/)).toBeTruthy();
  expect(
    screen.queryByRole('button', {
      name: /^(Assign|Recover|Replan|Activate|Complete)$/i,
    }),
  ).toBeNull();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  runtime.dispose();
});
test('riders retain intent, work state and local-slice filter without invented assignment source', async () => {
  const runtime = await preview();
  fireEvent.click(screen.getByRole('button', { name: /Riders$/ }));
  const table = await screen.findByRole('table', {
    name: 'Riders · backend ID order',
  });
  expect(within(table).getByText('IDLE')).toBeTruthy();
  expect(within(table).getByText('BUSY')).toBeTruthy();
  expect(within(table).getByText('RESERVED')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Work state in loaded slice'), {
    target: { value: 'BUSY' },
  });
  expect(within(table).queryByText('IDLE')).toBeNull();
  expect(within(table).getByText('BUSY')).toBeTruthy();
  expect(screen.getByText(/no rider name, live location/)).toBeTruthy();
  runtime.dispose();
});
test('assignments show pending groups and explain accepted/manager/committed read gap', async () => {
  const runtime = await preview();
  fireEvent.click(screen.getByRole('button', { name: /Assignments$/ }));
  const table = await screen.findByRole('table', {
    name: /Unassigned V1 groups/,
  });
  expect(within(table).getByText('COMPACTED')).toBeTruthy();
  expect(within(table).getByText('FALLBACK_SINGLETON')).toBeTruthy();
  expect(
    screen.getByText(
      /RIDER_OFFER_ACCEPTED, MANAGER_ASSIGNED and COMMITTED_DISPATCH/,
    ),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Assign$/ })).toBeNull();
  runtime.dispose();
});
test('route reference lookup displays current revision and ordered recovery-required tasks', async () => {
  const runtime = await preview('Rider failure');
  fireEvent.click(screen.getByRole('button', { name: 'Read sample route' }));
  const table = await screen.findByRole('table', {
    name: /Current revision tasks/,
  });
  expect(within(table).getByText('PICKUP')).toBeTruthy();
  expect(within(table).getByText('DISCHARGE')).toBeTruthy();
  expect(screen.getByText('RECOVERY_REQUIRED')).toBeTruthy();
  expect(screen.getByText(fixtureId(34))).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Region UUID'), {
    target: { value: fixtureId(60) },
  });
  fireEvent.submit(screen.getByLabelText('Region UUID').closest('form')!);
  expect(
    await screen.findByRole('table', {
      name: /Vehicle membership and unclosed shifts/,
    }),
  ).toBeTruthy();
  expect(screen.getByText(/not free or certified capacity/)).toBeTruthy();
  runtime.dispose();
});
test('replacement pending does not claim activation, completion or custody', async () => {
  const runtime = await preview('Recovery pending');
  fireEvent.click(screen.getByRole('button', { name: /Recovery$/ }));
  fireEvent.click(await screen.findByRole('button', { name: fixtureId(50) }));
  expect(
    await screen.findByText(
      'No evaluation recorded. Recommendation may still be pending.',
    ),
  ).toBeTruthy();
  const detail = screen.getByRole('region', { name: 'Replacement detail' });
  expect(within(detail).getByText('PENDING')).toBeTruthy();
  expect(
    within(detail).getByText(/Backend authoritative:/).textContent,
  ).toContain('No');
  expect(
    within(detail).getByText(/Custody transferred:/).textContent,
  ).toContain('No');
  runtime.dispose();
});
test('replacement candidates preserve backend ranking and expose no selection command', async () => {
  const runtime = await preview();
  fireEvent.click(screen.getByRole('button', { name: /Recovery$/ }));
  fireEvent.click(await screen.findByRole('button', { name: fixtureId(50) }));
  expect(
    await screen.findByRole('table', { name: /Candidate evaluations/ }),
  ).toBeTruthy();
  expect(
    screen.queryByRole('button', {
      name: /^(Select candidate|Approve|Recover)$/i,
    }),
  ).toBeNull();
  runtime.dispose();
});
test('V1 incidents do not imply handover or V2 failure completion', async () => {
  const runtime = await preview('Open pickup incident');
  fireEvent.click(screen.getByRole('button', { name: /Incidents$/ }));
  const table = await screen.findByRole('table', {
    name: /Open V1 pickup incidents/,
  });
  expect(within(table).getByText('RIDER_UNABLE_TO_CONTINUE')).toBeTruthy();
  expect(
    screen.getByText(/no receiving-point handover validation/),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText('V2 rider failure incident UUID'), {
    target: { value: fixtureId(40) },
  });
  fireEvent.submit(
    screen.getByLabelText('V2 rider failure incident UUID').closest('form')!,
  );
  expect(
    await screen.findByRole('table', { name: /Failure obligations/ }),
  ).toBeTruthy();
  runtime.dispose();
});
test('empty and unavailable scenarios are explicit and never call global fetch', async () => {
  const runtime = await preview('Empty region');
  expect(
    await screen.findByText('No open pickup incidents returned.'),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Scenario'), {
    target: { value: 'Backend unavailable' },
  });
  expect(
    await screen.findAllByText('Current read unavailable'),
  ).not.toHaveLength(0);
  expect(globalThis.fetch).not.toHaveBeenCalled();
  runtime.dispose();
});
test('manual refresh failure hides prior successful results and raw API error bodies', async () => {
  const { session, fetcher } = harness();
  await session.restore();
  const runtime = createRuntime('verified-adapter', session, {
    dispatch: false,
    fleet: false,
    orchestration: false,
  });
  render(<App runtime={runtime} />);
  expect(await screen.findByText('riders in this response')).toBeTruthy();
  fetcher.mockResolvedValue(
    response({ detail: 'secret phone address stacktrace' }, 500),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Refresh rider snapshot' }),
  );
  expect(await screen.findByText('Current read unavailable')).toBeTruthy();
  expect(screen.queryByText('riders in this response')).toBeNull();
  expect(screen.queryByText(/secret phone address/)).toBeNull();
  runtime.dispose();
});
test('sign out removes all manager views and selections immediately', async () => {
  const runtime = await preview();
  fireEvent.click(screen.getByRole('button', { name: 'Read sample route' }));
  await screen.findByRole('table', { name: /Current revision tasks/ });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  });
  expect(screen.queryByRole('navigation')).toBeNull();
  expect(screen.queryByRole('table')).toBeNull();
  expect(runtime.queries.getQueryCache().getAll()).toHaveLength(0);
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'Enter fixture session' }),
    );
  });
  await waitFor(() =>
    expect(
      screen.getByRole('heading', { name: 'Operations overview' }),
    ).toBeTruthy(),
  );
  expect(screen.queryByLabelText('Route UUID')).toBeNull();
  runtime.dispose();
});
test('offline manager reads fail finitely instead of remaining paused indefinitely', async () => {
  const { session, fetcher } = harness();
  await session.restore();
  fetcher.mockRejectedValue(new Error('offline connection'));
  const runtime = createRuntime('verified-adapter', session, {
    dispatch: false,
    fleet: false,
    orchestration: false,
  });
  onlineManager.setOnline(false);
  try {
    render(<App runtime={runtime} />);
    expect(
      await screen.findAllByText('Current read unavailable'),
    ).not.toHaveLength(0);
  } finally {
    onlineManager.setOnline(true);
    runtime.dispose();
  }
});
test('injected web login keeps original OTP command identities across ambiguous retries', async () => {
  const { session, adapter } = harness();
  adapter.startOtp.mockRejectedValueOnce(new Error('lost start response'));
  adapter.verifyOtp.mockRejectedValueOnce(new Error('lost verify response'));
  const runtime = createRuntime('verified-adapter', session, {
    dispatch: false,
    fleet: false,
    orchestration: false,
  });
  render(<App runtime={runtime} />);
  fireEvent.change(screen.getByLabelText('Phone number'), {
    target: { value: '+919999999999' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Request code' }));
  await screen.findByText('Authentication is unavailable. Please try again.');
  fireEvent.click(screen.getByRole('button', { name: 'Request code' }));
  await screen.findByLabelText('One-time code');
  expect(adapter.startOtp.mock.calls[0][0]).toEqual(
    adapter.startOtp.mock.calls[1][0],
  );
  fireEvent.change(screen.getByLabelText('One-time code'), {
    target: { value: '123456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
  await screen.findByText(
    'The web session could not be verified. Please try again.',
  );
  expect(screen.getByLabelText('One-time code')).toBeTruthy();
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Verify code' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
  await screen.findByRole('heading', { name: 'Operations overview' });
  expect(adapter.verifyOtp.mock.calls[0][0]).toEqual(
    adapter.verifyOtp.mock.calls[1][0],
  );
  runtime.dispose();
});
test('known-booking assignment lineage exposes real states without fabricating sources', async () => {
  const runtime = await preview('Reassignment completed');
  fireEvent.click(screen.getByRole('button', { name: /Assignments$/ }));
  fireEvent.change(
    screen.getByLabelText('Booking UUID for assignment history'),
    { target: { value: fixtureId(55) } },
  );
  fireEvent.submit(
    screen
      .getByLabelText('Booking UUID for assignment history')
      .closest('form')!,
  );
  const table = await screen.findByRole('table', {
    name: /Known-booking assignment history/,
  });
  expect(within(table).getByText('ACTIVE')).toBeTruthy();
  expect(within(table).getByText(fixtureId(1))).toBeTruthy();
  expect(screen.getByText('COLLECTED')).toBeTruthy();
  expect(within(table).queryByText('MANAGER_ASSIGNED')).toBeNull();
  runtime.dispose();
});
test('region identity discovery and immutable custody facts use their actual reads', async () => {
  const runtime = await preview('Reassignment completed');
  fireEvent.click(screen.getByRole('button', { name: /Routes$/ }));
  expect(
    await screen.findByRole('table', { name: /Recorded region identities/ }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: 'Read regional resources' }),
  );
  expect(
    await screen.findByRole('table', { name: /Vehicle membership/ }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Incidents$/ }));
  fireEvent.change(
    screen.getByLabelText('Booking UUID for custody transfers'),
    { target: { value: fixtureId(55) } },
  );
  fireEvent.submit(
    screen
      .getByLabelText('Booking UUID for custody transfers')
      .closest('form')!,
  );
  const transfers = await screen.findByRole('table', {
    name: /Immutable custody transfers/,
  });
  expect(within(transfers).getByText(fixtureId(100))).toBeTruthy();
  expect(
    screen.getByText(/do not establish receiving-point handover validation/),
  ).toBeTruthy();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  runtime.dispose();
});
