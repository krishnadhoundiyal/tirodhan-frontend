import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import App from '../App';
import {
  CandidateActions,
  LineageReassignment,
  RecoveryInterventions,
  SelectedReconciliation,
} from '../command-ui';
import * as dto from '../api/contracts';
import { reads } from '../api/reads';
import {
  fixtureId as id,
  fixturePayload,
  fixtureRuntime,
} from '../preview/fixtures';
import { createRuntime } from '../runtime';
import { harness, response } from './helpers';

async function preview() {
  const runtime = fixtureRuntime();
  await runtime.session.restore();
  render(<App runtime={runtime} />);
  await screen.findByRole('heading', { name: 'Operations overview' });
  return runtime;
}
const detail = () =>
  dto.replacementDetail(
    fixturePayload(`/v2/manager/replacements/${id(50)}`, 'Normal workload'),
  );
const failure = () =>
  dto.failureDetail(
    fixturePayload(`/v2/manager/rider-failures/${id(40)}`, 'Normal workload'),
  );

test('manual assignment requires real selections, review and a separate confirmation; records survive navigation', async () => {
  const runtime = await preview();
  fireEvent.click(screen.getByRole('button', { name: /Assignments$/ }));
  const group = dto.group(
    (
      fixturePayload(
        '/v1/manager/collection-groups/pending-assignment',
        'Normal workload',
      ) as unknown[]
    )[0],
  );
  fireEvent.change(await screen.findByLabelText('Pending group'), {
    target: { value: group.collection_group_id },
  });
  fireEvent.change(await screen.findByLabelText('Assignment rider'), {
    target: { value: id(1) },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Review manual assignment' }),
  );
  const record = screen.getByRole('article', {
    name: 'Assign pending V1 group',
  });
  expect(
    (
      within(record).getByRole('button', {
        name: 'Confirm fixture simulation',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(runtime.commands.snapshot()[0].phase).toBe('review');
  fireEvent.click(screen.getByRole('button', { name: /Overview$/ }));
  expect(
    screen.getByRole('article', { name: 'Assign pending V1 group' }),
  ).toBeTruthy();
  fireEvent.click(within(record).getByRole('checkbox'));
  fireEvent.click(
    within(record).getByRole('button', { name: 'Confirm fixture simulation' }),
  );
  await waitFor(() =>
    expect(runtime.commands.snapshot()[0].phase).toBe('completed'),
  );
  expect(
    await screen.findByText(/Authoritative command response received/),
  ).toBeTruthy();
  expect(globalThis.fetch).not.toHaveBeenCalled();
  runtime.dispose();
});
test('failure submits the actual selected-rider route map and retains 202 incident identity for reconciliation', async () => {
  const runtime = await preview();
  fireEvent.click(screen.getByRole('button', { name: /Riders$/ }));
  fireEvent.click(
    (await screen.findAllByRole('button', { name: 'Read recovery state' }))[1],
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'Review rider failure' }),
  );
  const row = runtime.commands.snapshot()[0];
  expect(JSON.parse(row.command.payload)).toMatchObject({
    rider_id: id(2),
    expected_route_versions: { [id(30)]: 3 },
  });
  const record = screen.getByRole('article', { name: 'Declare rider failure' });
  fireEvent.click(within(record).getByRole('checkbox'));
  fireEvent.click(
    within(record).getByRole('button', { name: 'Confirm fixture simulation' }),
  );
  expect(
    await screen.findByText(
      /Accepted for processing. Recovery and activation are not complete/,
    ),
  ).toBeTruthy();
  expect(
    await screen.findByRole('table', {
      name: 'Recovery obligation outcomes in this page',
    }),
  ).toBeTruthy();
  expect(runtime.commands.snapshot()[0].result).toEqual({
    resource_id: id(40),
  });
  runtime.dispose();
});
test('candidate decisions use server rank, exact route/source/region evidence and keep ordinary selection distinct', async () => {
  const runtime = fixtureRuntime();
  await runtime.session.restore();
  const data = detail();
  render(<CandidateActions runtime={runtime} detail={data} />);
  fireEvent.change(screen.getByLabelText('Backend candidate'), {
    target: { value: id(52) },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Review replacement selection' }),
  );
  const command = runtime.commands.snapshot()[0].command;
  expect(command.path).toBe(`/v2/manager/replacements/${id(50)}/select`);
  expect(JSON.parse(command.payload)).toMatchObject({
    selected_candidate_id: id(52),
    expected_version: 3,
    expected_source_version: 6,
    expected_region_version: 2,
    expected_route_versions: { [id(30)]: 3 },
  });
  runtime.dispose();
});
test('failure candidate selection uses APPROVE_RECOVERY and exact affected obligations, never ordinary select', async () => {
  const runtime = fixtureRuntime();
  await runtime.session.restore();
  render(
    <CandidateActions
      runtime={runtime}
      detail={detail()}
      incident={failure()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Backend candidate'), {
    target: { value: id(52) },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Review recovery allocation' }),
  );
  const command = runtime.commands.snapshot()[0].command;
  expect(command.path).toBe('/v2/manager/rider-failures');
  expect(JSON.parse(command.payload)).toMatchObject({
    operation: 'APPROVE_RECOVERY',
    incident_id: id(40),
    expected_version: 2,
    selections: [{ candidate_id: id(52), replacement_ids: [id(50)] }],
  });
  runtime.dispose();
});
test.each([
  'expired',
  'notCurrent',
  'notSelectable',
  'missingEvidence',
  'partialCoverage',
] as const)(
  'candidate %s cannot prepare a failure allocation',
  async (variant) => {
    const runtime = fixtureRuntime();
    await runtime.session.restore();
    const data = detail();
    if (variant === 'expired')
      data.evaluation!.expires_at = '2020-01-01T00:00:00Z';
    if (variant === 'notCurrent') data.evaluation!.current = false;
    if (variant === 'notSelectable') data.candidates[0].selectable = false;
    if (variant === 'missingEvidence')
      data.candidates[0].route_versions = undefined;
    if (variant === 'partialCoverage')
      data.candidates[0].affected_bookings!.push(id(56));
    render(
      <CandidateActions runtime={runtime} detail={data} incident={failure()} />,
    );
    fireEvent.change(screen.getByLabelText('Backend candidate'), {
      target: { value: id(52) },
    });
    expect(
      (
        screen.getByRole('button', {
          name: 'Review recovery allocation',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(runtime.commands.snapshot()).toHaveLength(0);
    runtime.dispose();
  },
);
test('V2 route lineage cannot be presented as a V1 reassignment predecessor', async () => {
  const runtime = fixtureRuntime();
  await runtime.session.restore();
  const lineage = dto.bookingLineage(
    fixturePayload(
      `/v1/manager/business/bookings/${id(55)}/lineage`,
      'Normal workload',
    ),
  );
  render(<LineageReassignment runtime={runtime} lineage={lineage} />);
  expect(screen.getAllByRole('option')).toHaveLength(1);
  expect(
    screen.queryByRole('button', { name: 'Review V1 reassignment' }),
  ).toBeNull();
  runtime.dispose();
});
test('retry/new-options are distinct versioned recovery decisions; no-collection resolution requires attestation', async () => {
  const runtime = fixtureRuntime();
  await runtime.session.restore();
  const data = dto.failureDetail(
    fixturePayload(`/v2/manager/rider-failures/${id(40)}`, 'Recovery pending'),
  );
  data.assignments[0].status = 'ATTENTION';
  data.assignments[0].failure_code = 'ACTIVATION_FAILED';
  render(
    <QueryClientProvider client={runtime.queries}>
      <RecoveryInterventions runtime={runtime} detail={data} />
    </QueryClientProvider>,
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Review new recovery options' }),
  );
  expect(
    JSON.parse(runtime.commands.snapshot()[0].command.payload),
  ).toMatchObject({
    operation: 'RETRY_RECOVERY',
    assignment_id: id(80),
    expected_version: 2,
    request_new_options: true,
  });
  fireEvent.change(screen.getByLabelText('Failure obligation'), {
    target: { value: id(50) },
  });
  const resolution = await screen.findByRole('button', {
    name: 'Review failed pickup resolution',
  });
  expect((resolution as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(
    screen.getByLabelText(
      'I have confirmed that this pickup was not collected.',
    ),
  );
  fireEvent.click(resolution);
  expect(
    JSON.parse(runtime.commands.snapshot()[1].command.payload),
  ).toMatchObject({
    operation: 'RESOLVE_FAILED_PICKUP',
    replacement_id: id(50),
    expected_version: 3,
    no_collection_confirmed: true,
  });
  runtime.dispose();
});

async function reconciler() {
  const { session, fetcher } = harness();
  await session.restore();
  const runtime = createRuntime('verified-adapter', session, {
    dispatch: true,
    fleet: true,
    orchestration: true,
  });
  const spec = reads.failure(id(40));
  const view = render(
    <QueryClientProvider client={runtime.queries}>
      <SelectedReconciliation
        runtime={runtime}
        spec={spec}
        navigation="Riders"
      />
    </QueryClientProvider>,
  );
  await screen.findByRole('table', {
    name: 'Recovery obligation outcomes in this page',
  });
  const count = () =>
    fetcher.mock.calls.filter(([input]) =>
      String(input).includes('/rider-failures/'),
    ).length;
  return { runtime, fetcher, view, count, spec };
}
test('selected-resource reconciliation has six reads maximum and cannot run indefinitely', async () => {
  const { runtime, count } = await reconciler();
  jest.useFakeTimers();
  try {
    fireEvent.click(
      screen.getByRole('button', { name: 'Reconcile for up to 30 seconds' }),
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    for (let index = 0; index < 6; index++)
      await act(async () => {
        await jest.advanceTimersByTimeAsync(5000);
      });
    expect(count()).toBe(7);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(120000);
    });
    expect(count()).toBe(7);
    expect(screen.getByText(/Bounded reconciliation ended/)).toBeTruthy();
  } finally {
    runtime.dispose();
    jest.useRealTimers();
  }
});
test.each(['stop', 'navigation', 'hidden', 'unmount'] as const)(
  '%s cancels reconciliation without another request',
  async (mode) => {
    const { runtime, count, view, spec } = await reconciler();
    jest.useFakeTimers();
    try {
      fireEvent.click(
        screen.getByRole('button', { name: 'Reconcile for up to 30 seconds' }),
      );
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      if (mode === 'stop')
        fireEvent.click(
          screen.getByRole('button', { name: 'Stop reconciliation' }),
        );
      if (mode === 'navigation')
        view.rerender(
          <QueryClientProvider client={runtime.queries}>
            <SelectedReconciliation
              runtime={runtime}
              spec={spec}
              navigation="Overview"
            />
          </QueryClientProvider>,
        );
      if (mode === 'hidden') {
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          value: true,
        });
        fireEvent(document, new Event('visibilitychange'));
      }
      if (mode === 'unmount') view.unmount();
      const before = count();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60000);
      });
      expect(count()).toBe(before);
    } finally {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        value: false,
      });
      runtime.dispose();
      jest.useRealTimers();
    }
  },
);
test('a reconciliation read error hides previous projections and ends the run', async () => {
  const { runtime, fetcher, count } = await reconciler();
  fetcher.mockResolvedValueOnce(response({}, 503));
  fireEvent.click(
    screen.getByRole('button', { name: 'Reconcile for up to 30 seconds' }),
  );
  expect(
    await screen.findByText(/Reconciliation stopped after a read error/),
  ).toBeTruthy();
  expect(
    screen.queryByRole('table', {
      name: 'Recovery obligation outcomes in this page',
    }),
  ).toBeNull();
  expect(count()).toBe(2);
  runtime.dispose();
});

test('a verified RESOLVED incident ends reconciliation without claiming completion from HTTP acceptance', async () => {
  const { runtime, fetcher, count } = await reconciler();
  const resolved = failure();
  resolved.status = 'RESOLVED';
  fetcher.mockResolvedValueOnce(response(resolved));
  jest.useFakeTimers();
  try {
    fireEvent.click(
      screen.getByRole('button', { name: 'Reconcile for up to 30 seconds' }),
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('RESOLVED')).toBeTruthy();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(120000);
    });
    expect(count()).toBe(2);
  } finally {
    runtime.dispose();
    jest.useRealTimers();
  }
});

test('the hard 30-second deadline cancels a stalled reconciliation request even if fetch ignores abort', async () => {
  const { session, fetcher } = harness(['MANAGER'], 120000);
  await session.restore();
  const runtime = createRuntime('verified-adapter', session, {
    dispatch: true,
    fleet: true,
    orchestration: true,
  });
  render(
    <QueryClientProvider client={runtime.queries}>
      <SelectedReconciliation
        runtime={runtime}
        spec={reads.failure(id(40))}
        navigation="Recovery"
      />
    </QueryClientProvider>,
  );
  await screen.findByRole('table', {
    name: 'Recovery obligation outcomes in this page',
  });
  let signal: AbortSignal | undefined;
  fetcher.mockImplementationOnce(async (_input, options) => {
    signal = options?.signal ?? undefined;
    return new Promise<Response>(() => {});
  });
  jest.useFakeTimers();
  try {
    fireEvent.click(
      screen.getByRole('button', { name: 'Reconcile for up to 30 seconds' }),
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(30000);
    });
    expect(signal?.aborted).toBe(true);
    expect(
      screen.getByText(/30-second reconciliation window ended/),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Reconcile for up to 30 seconds',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  } finally {
    runtime.dispose();
    jest.useRealTimers();
  }
});
