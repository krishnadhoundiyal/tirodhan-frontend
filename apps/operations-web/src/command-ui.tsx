import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { commands, type Command } from './api/commands';
import * as dto from './api/contracts';
import { reads, type ReadSpec } from './api/reads';
import { list, object, integer, uuid, type Decoded } from './api/schema';
import type { CommandContext, CommandRecord } from './command-store';
import type { Runtime } from './runtime';
import { Panel, ReadPanel, Reference, Status, Table, Time } from './ui';

function Review({
  runtime,
  build,
  context,
  label,
  disabled = false,
}: {
  runtime: Runtime;
  build: () => Command;
  context?: CommandContext;
  label: string;
  disabled?: boolean;
}) {
  const [error, setError] = useState('');
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          try {
            runtime.commands.review(build(), context);
            setError('');
            document
              .getElementById('manager-command-review')
              ?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : 'This decision cannot be prepared.',
            );
          }
        }}
      >
        {label}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
function RiderChoice({
  riders,
  value,
  onChange,
  label = 'Replacement rider',
}: {
  riders: dto.Rider[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose a backend-known rider</option>
        {riders.map((rider) => (
          <option key={rider.rider_id} value={rider.rider_id}>
            {rider.rider_id} · {rider.profile_status} ·{' '}
            {rider.availability_intent} · {rider.work_state}
          </option>
        ))}
      </select>
    </label>
  );
}
export function PendingAssignment({
  runtime,
  groups,
}: {
  runtime: Runtime;
  groups: Decoded<typeof dto.group>[];
}) {
  const [group, setGroup] = useState(''),
    [rider, setRider] = useState('');
  const selected = groups.find((row) => row.collection_group_id === group);
  return (
    <Panel title="Manual V1 assignment">
      <label>
        Pending group
        <select
          value={selected ? group : ''}
          onChange={(event) => {
            setGroup(event.target.value);
            setRider('');
          }}
        >
          <option value="">Choose a pending group</option>
          {groups.map((row) => (
            <option
              key={row.collection_group_id}
              value={row.collection_group_id}
            >
              {row.collection_group_id} · {row.cell_id} · {row.pickup_count}{' '}
              pickups
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <>
          <p>
            {selected.planning_mode} · {selected.cell_id} ·{' '}
            {selected.pickup_count} pickups ·{' '}
            <Time value={selected.slot_start} /> to{' '}
            <Time value={selected.slot_end} />
          </p>
          <ReadPanel
            runtime={runtime}
            title="Assignment rider choices"
            spec={reads.riders()}
          >
            {(rows) => (
              <>
                <RiderChoice
                  riders={rows}
                  value={rider}
                  onChange={setRider}
                  label="Assignment rider"
                />
                <p>
                  Availability intent alone does not establish eligibility. The
                  backend makes the final assignment decision.
                </p>
                <Review
                  runtime={runtime}
                  label="Review manual assignment"
                  disabled={!rows.some((row) => row.rider_id === rider)}
                  build={() => commands.assign(group, rider)}
                />
              </>
            )}
          </ReadPanel>
        </>
      )}
    </Panel>
  );
}
export function Reassignment({
  runtime,
  assignment,
  rider: currentRider,
  booking,
}: {
  runtime: Runtime;
  assignment: string;
  rider: string;
  booking?: string;
}) {
  const [rider, setRider] = useState(''),
    [incident, setIncident] = useState('');
  return (
    <ReadPanel
      runtime={runtime}
      title="V1 reassignment rider choices"
      spec={reads.riders()}
    >
      {(rows) => (
        <>
          <p>
            Predecessor <Reference value={assignment} /> · current rider{' '}
            <Reference value={currentRider} />. Reassign outstanding ASSIGNED
            pickups only. Collected custody stays with its custodian.
          </p>
          <RiderChoice
            riders={rows.filter((row) => row.rider_id !== currentRider)}
            value={rider}
            onChange={setRider}
          />
          <ReadPanel
            runtime={runtime}
            title="V1 reassignment incident context"
            spec={reads.incidents()}
          >
            {(incidents) => (
              <>
                <label>
                  Optional V1 pickup incident
                  <select
                    value={incident}
                    onChange={(event) => setIncident(event.target.value)}
                  >
                    <option value="">No incident attached</option>
                    {incidents
                      .filter((row) => row.rider_assignment_id === assignment)
                      .map((row) => (
                        <option key={row.incident_id} value={row.incident_id}>
                          {row.incident_id} · {row.reason_code}
                        </option>
                      ))}
                  </select>
                </label>
                <Review
                  runtime={runtime}
                  label="Review V1 reassignment"
                  disabled={
                    !rows.some(
                      (row) =>
                        row.rider_id === rider && row.rider_id !== currentRider,
                    )
                  }
                  build={() => {
                    if (
                      incident &&
                      !incidents.some(
                        (row) =>
                          row.incident_id === incident &&
                          row.rider_assignment_id === assignment,
                      )
                    )
                      throw new Error(
                        'Refresh the incident context before review.',
                      );
                    return commands.reassign(
                      assignment,
                      rider,
                      undefined,
                      incident || undefined,
                    );
                  }}
                  context={{ booking }}
                />
              </>
            )}
          </ReadPanel>
        </>
      )}
    </ReadPanel>
  );
}
export function LineageReassignment({
  runtime,
  lineage,
}: {
  runtime: Runtime;
  lineage: Decoded<typeof dto.bookingLineage>;
}) {
  const [selected, setSelected] = useState('');
  const candidates = lineage.assignments.filter(
    (row) =>
      row.status === 'ACTIVE' &&
      row.released_at === null &&
      row.route_id === null &&
      lineage.pickup_status === 'ASSIGNED',
  );
  const predecessor = candidates.find((row) => row.assignment_id === selected);
  return (
    <Panel title="Known predecessor reassignment">
      <p>
        Only an ACTIVE, unreleased predecessor without a linked V2 route in this
        booking projection can be reviewed here. Source is not exposed by
        lineage; the backend must verify a V1 group and transferable work. Use
        V2 failure recovery for routed work.
      </p>
      <label>
        V1 predecessor candidate
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Choose a backend assignment reference</option>
          {candidates.map((row) => (
            <option key={row.assignment_id} value={row.assignment_id}>
              {row.assignment_id} · rider {row.rider_id}
            </option>
          ))}
        </select>
      </label>
      {predecessor && (
        <Reassignment
          key={predecessor.assignment_id}
          runtime={runtime}
          assignment={predecessor.assignment_id}
          rider={predecessor.rider_id}
          booking={lineage.request_id}
        />
      )}
    </Panel>
  );
}
export function FailureAction({
  runtime,
  state,
}: {
  runtime: Runtime;
  state: Decoded<typeof dto.recoveryState>;
}) {
  const [reason, setReason] = useState<
    'RIDER_UNAVAILABLE' | 'VEHICLE_UNAVAILABLE' | 'EXECUTION_EXCEPTION'
  >('RIDER_UNAVAILABLE');
  return (
    <Panel title="Declare V2 rider failure">
      <p>
        Selected rider <Reference value={state.rider_id} />. The displayed
        non-closed route versions will be sent unchanged. The backend discovers
        affected work, blocks resources and queues recovery evaluation.
        Acceptance does not reassign work.
      </p>
      <label>
        Failure reason
        <select
          value={reason}
          onChange={(event) => setReason(event.target.value as typeof reason)}
        >
          <option>RIDER_UNAVAILABLE</option>
          <option>VEHICLE_UNAVAILABLE</option>
          <option>EXECUTION_EXCEPTION</option>
        </select>
      </label>
      <Review
        runtime={runtime}
        label="Review rider failure"
        context={{ rider: state.rider_id }}
        build={() =>
          commands.fail(
            state.rider_id,
            reason,
            Object.fromEntries(
              state.routes.map((row) => [row.route_id, row.version]),
            ),
          )
        }
      />
    </Panel>
  );
}

const candidateEvidence = object({
  affected_bookings: list(uuid, 100),
  route_versions: list(object({ route_id: uuid, version: integer }), 1000),
});
export function CandidateActions({
  runtime,
  detail,
  incident,
}: {
  runtime: Runtime;
  detail: Decoded<typeof dto.replacementDetail>;
  incident?: Decoded<typeof dto.failureDetail>;
}) {
  const [choice, setChoice] = useState('');
  const selected = detail.candidates.find((row) => row.candidate_id === choice);
  const evaluation = detail.evaluation;
  let evidence: Decoded<typeof candidateEvidence> | null = null;
  try {
    if (selected) evidence = candidateEvidence(selected);
  } catch {
    /* Read visibility survives older summaries; writes need verified evidence. */
  }
  const obligations =
    incident && evidence
      ? incident.obligations.filter((row) =>
          evidence!.affected_bookings.includes(row.request_id),
        )
      : [];
  const coverage =
    !!evidence &&
    evidence.affected_bookings.length > 0 &&
    new Set(evidence.affected_bookings).size ===
      evidence.affected_bookings.length &&
    obligations.length === evidence.affected_bookings.length &&
    obligations.every((row) => row.status === 'RECOMMENDED');
  const fresh = !!(
    selected?.selectable &&
    evaluation?.current &&
    Date.parse(evaluation.expires_at) > Date.now()
  );
  const canReview =
    fresh &&
    !!evidence &&
    (!incident || (incident.status === 'OPEN' && coverage));
  return (
    <Panel
      title={
        incident
          ? 'Incident recovery allocation'
          : 'Ordinary replacement selection'
      }
    >
      <p>
        {incident
          ? 'Approve the exact backend candidate coverage for this failure incident. Activation and physical custody remain separate.'
          : 'Failure obligations require the incident recovery workflow. This endpoint cannot activate a route or complete custody.'}
      </p>
      <label>
        Backend candidate
        <select
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          <option value="">Choose an evaluated candidate</option>
          {detail.candidates.map((row) => (
            <option value={row.candidate_id} key={row.candidate_id}>
              Rank {row.rank} · {row.candidate_id} · rider {row.rider_id}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <>
          <p>
            Candidate rider <Reference value={selected.rider_id} /> · vehicle{' '}
            <Reference value={selected.vehicle_id} /> · shift{' '}
            <Reference value={selected.shift_id} />
          </p>
          <p>
            Affected bookings:{' '}
            {evidence?.affected_bookings.join(', ') ??
              'Required evidence unavailable'}
          </p>
          {incident && !coverage && (
            <p role="status">
              Complete candidate coverage is not available in this incident
              page. No partial allocation can be submitted.
            </p>
          )}
          {!fresh && (
            <p role="status">
              Refresh the evaluation. Expired or non-current candidates cannot
              be submitted.
            </p>
          )}
        </>
      )}
      <Review
        runtime={runtime}
        label={
          incident
            ? 'Review recovery allocation'
            : 'Review replacement selection'
        }
        disabled={!canReview}
        context={{
          incident: incident?.incident_id,
          replacement: detail.replacement_id,
          rider: detail.original_rider_id,
        }}
        build={() => {
          // Recheck the wall clock at review, not just when the read was rendered.
          if (
            !evaluation ||
            !selected ||
            !evidence ||
            !canReview ||
            Date.parse(evaluation.expires_at) <= Date.now()
          )
            throw new Error(
              'Refresh the evaluation before reviewing a decision.',
            );
          return incident
            ? commands.approve(
                incident.incident_id,
                incident.version,
                choice,
                obligations.map((row) => row.replacement_id),
                'MANAGER_DECISION',
              )
            : commands.select(
                detail.replacement_id,
                choice,
                detail.version,
                evaluation.source_version,
                evaluation.region_version,
                Object.fromEntries(
                  evidence.route_versions.map((row) => [
                    row.route_id,
                    row.version,
                  ]),
                ),
                'MANAGER_DECISION',
              );
        }}
      />
    </Panel>
  );
}
export function RecoveryInterventions({
  runtime,
  detail,
}: {
  runtime: Runtime;
  detail: Decoded<typeof dto.failureDetail>;
}) {
  const [replacement, setReplacement] = useState(''),
    [noCollection, setNoCollection] = useState(false);
  return (
    <Panel title="Recovery decisions">
      {detail.assignments
        .filter((row) =>
          ['ATTENTION', 'AWAITING_TRANSFER'].includes(row.status),
        )
        .map((row) => (
          <div key={row.assignment_id} className="evaluation">
            <Reference value={row.assignment_id} />
            <Status value={row.status} />
            <Status value={row.failure_code} />
            <Review
              runtime={runtime}
              label="Review activation retry"
              context={{ incident: detail.incident_id }}
              build={() =>
                commands.retry(row.assignment_id, row.version, false)
              }
            />
            <Review
              runtime={runtime}
              label="Review new recovery options"
              context={{ incident: detail.incident_id }}
              build={() => commands.retry(row.assignment_id, row.version, true)}
            />
            <p>
              New options supersede this allocation. Unresolved physical
              transfer must be resolved through the backend custody workflow
              first.
            </p>
          </div>
        ))}
      <label>
        Failure obligation
        <select
          value={replacement}
          onChange={(event) => {
            setReplacement(event.target.value);
            setNoCollection(false);
          }}
        >
          <option value="">Choose an obligation to inspect</option>
          {detail.obligations.map((row) => (
            <option key={row.replacement_id} value={row.replacement_id}>
              {row.replacement_id} · request {row.request_id}
            </option>
          ))}
        </select>
      </label>
      {detail.obligations.some((row) => row.replacement_id === replacement) && (
        <ReadPanel
          runtime={runtime}
          title="Failure obligation detail"
          spec={reads.replacement(replacement)}
        >
          {(data) => (
            <>
              <Status value={data.status} />
              <p>
                Request <Reference value={data.request_id} /> · replacement
                version {data.version}
              </p>
              <CandidateActions
                runtime={runtime}
                detail={data}
                incident={detail}
              />
              <label>
                <input
                  type="checkbox"
                  checked={noCollection}
                  onChange={(event) => setNoCollection(event.target.checked)}
                />
                I have confirmed that this pickup was not collected.
              </label>
              <Review
                runtime={runtime}
                label="Review failed pickup resolution"
                disabled={!noCollection}
                context={{ incident: detail.incident_id, replacement }}
                build={() =>
                  commands.resolve(replacement, data.version, noCollection)
                }
              />
              <p>
                This attestation allows the backend to release applicable route
                tasks and reconsider recovery. It does not establish collection
                completion.
              </p>
            </>
          )}
        </ReadPanel>
      )}
    </Panel>
  );
}

function DecisionValue({ field, value }: { field: string; value: unknown }) {
  if (field === 'selections')
    return (
      <>
        {(value as { candidate_id: string; replacement_ids: string[] }[]).map(
          (selection) => (
            <div key={selection.candidate_id}>
              Candidate <Reference value={selection.candidate_id} />
              <span>Covered replacement obligations</span>
              {selection.replacement_ids.map((id) => (
                <Reference key={id} value={id} />
              ))}
            </div>
          ),
        )}
      </>
    );
  if (field === 'expected_route_versions')
    return (
      <>
        {Object.entries(value as Record<string, number>).map(
          ([id, version]) => (
            <div key={id}>
              <Reference value={id} /> version {version}
            </div>
          ),
        )}
      </>
    );
  if (typeof value === 'boolean') return <>{value ? 'Yes' : 'No'}</>;
  return <>{String(value)}</>;
}
function CommandReview({
  runtime,
  row,
}: {
  runtime: Runtime;
  row: CommandRecord;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const body = JSON.parse(row.command.payload) as Record<string, unknown>;
  const retry =
    row.phase === 'uncertain' ||
    (row.phase === 'conflict' &&
      ['COMMAND_IN_PROGRESS', 'RETRYABLE_TRANSACTION_CONFLICT'].includes(
        row.code ?? '',
      ));
  const canSubmit = row.phase === 'review' || retry;
  const result = row.result;
  return (
    <article className="evaluation" aria-label={row.command.title}>
      <h3>{row.command.title}</h3>
      <p>
        Target <Reference value={row.command.target} />
      </p>
      {row.command.identity && (
        <p>
          Retained command identity <Reference value={row.command.identity} />
        </p>
      )}
      <dl>
        {Object.entries(body)
          .filter(
            ([key]) =>
              ![
                'client_command_id',
                'client_reassignment_id',
                'operation',
              ].includes(key),
          )
          .map(([key, value]) => (
            <div key={key}>
              <dt>{key.replaceAll('_', ' ')}</dt>
              <dd>
                <DecisionValue field={key} value={value} />
              </dd>
            </div>
          ))}
      </dl>
      <p role="status">
        {row.phase === 'accepted'
          ? 'Accepted for processing. Recovery and activation are not complete.'
          : row.phase === 'completed'
            ? 'Authoritative command response received. Review current projections below.'
            : row.phase === 'submitting'
              ? 'Submission in progress…'
              : row.phase}
      </p>
      {row.message && <p role="alert">{row.message}</p>}
      {row.code && (
        <p>
          <Status value={row.code} />
          {row.code === 'USE_INCIDENT_RECOVERY_ALLOCATION' &&
            ' Open the rider failure incident and approve recovery allocation there.'}
        </p>
      )}
      {result &&
        ('resource_id' in result ? (
          <p>
            Returned resource <Reference value={result.resource_id} />
          </p>
        ) : 'assignment_id' in result ? (
          <>
            <p>
              Assignment <Reference value={result.assignment_id} /> · group{' '}
              <Reference value={result.collection_group_id} /> · rider{' '}
              <Reference value={result.rider_id} />
            </p>
            <Status value={result.source} />
            <Status value={result.status} />
            <p>
              Assigned <Time value={result.assigned_at} /> · started{' '}
              <Time value={result.started_at} /> · completed{' '}
              <Time value={result.completed_at} />
            </p>
            {result.collection_group_id &&
              result.status === 'ACTIVE' &&
              ['MANAGER_ASSIGNED', 'RIDER_OFFER_ACCEPTED'].includes(
                result.source,
              ) && (
                <Reassignment
                  runtime={runtime}
                  assignment={result.assignment_id}
                  rider={result.rider_id}
                  booking={row.context.booking}
                />
              )}
          </>
        ) : (
          <p>
            Replacement <Reference value={result.replacement_id} />
            <Status value={result.status} />
            <Status value={result.activation_state} /> Backend authoritative:{' '}
            {result.authoritative ? 'Yes' : 'No'}
          </p>
        ))}
      {canSubmit && (
        <>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            {retry
              ? 'I reviewed current state and authorize retrying the identical command.'
              : 'I reviewed this operational decision and confirm submission.'}
          </label>
          <button
            type="button"
            disabled={!confirmed}
            onClick={() => {
              setConfirmed(false);
              void runtime.commands.submit(row.id, true);
            }}
          >
            {retry
              ? 'Retry identical command'
              : runtime.kind === 'fixture'
                ? 'Confirm fixture simulation'
                : 'Confirm command'}
          </button>
        </>
      )}
      {!['submitting', 'uncertain', 'accepted'].includes(row.phase) && (
        <button
          type="button"
          className="secondary"
          onClick={() => runtime.commands.dismiss(row.id)}
        >
          Close command record
        </button>
      )}
    </article>
  );
}

export function CommandCenter({
  runtime,
  navigation,
}: {
  runtime: Runtime;
  navigation: string;
}) {
  const rows = useSyncExternalStore(
    runtime.commands.subscribe,
    runtime.commands.snapshot,
  );
  const [selected, setSelected] = useState('latest');
  const row =
    selected === 'latest'
      ? [...rows].reverse().find((row) => row.result)
      : rows.find((row) => String(row.id) === selected);
  const resource =
    row?.result && 'resource_id' in row.result
      ? row.result.resource_id
      : undefined;
  const operation = row
    ? (JSON.parse(row.command.payload) as { operation?: string }).operation
    : undefined;
  const incident =
    operation === 'FAIL_RIDER' ? resource : row?.context.incident;
  const replacement = row?.context.replacement;
  return (
    <section id="manager-command-review" aria-label="Session command records">
      <Panel
        title="Session command records"
        note="Decisions and identities remain in memory across navigation, until sign-out or page reload. A lost browser session cannot safely replay an unknown command; inspect backend state first."
      >
        {runtime.kind === 'fixture' && (
          <p>Fixture simulation only. No real operational mutations.</p>
        )}
        {!rows.length && <p>No decisions prepared in this session.</p>}
        {rows.map((record) => (
          <CommandReview key={record.id} runtime={runtime} row={record} />
        ))}
        {!!rows.length && (
          <label>
            Reconcile one retained operation
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="latest">
                Latest accepted or completed operation
              </option>
              <option value="none">No selected operation</option>
              {rows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.command.title} · {row.command.target}
                </option>
              ))}
            </select>
          </label>
        )}
        {row && (
          <div key={selected}>
            {incident ? (
              <SelectedReconciliation
                runtime={runtime}
                spec={reads.failure(incident)}
                navigation={navigation}
              />
            ) : replacement ? (
              <SelectedReconciliation
                runtime={runtime}
                spec={reads.replacement(replacement)}
                navigation={navigation}
              />
            ) : row.context.rider ? (
              <SelectedReconciliation
                runtime={runtime}
                spec={reads.recovery(row.context.rider)}
                navigation={navigation}
              />
            ) : row.context.booking ? (
              <SelectedReconciliation
                runtime={runtime}
                spec={reads.lineage(row.context.booking)}
                navigation={navigation}
              />
            ) : (
              <p>
                Refresh the pending groups and riders above. This command has no
                independent status endpoint.
              </p>
            )}
            {incident && (
              <p>
                Read this incident in Incidents to inspect paginated
                obligations, activation revisions and acknowledgments.
                Acceptance alone cannot establish recovery completion.
              </p>
            )}
          </div>
        )}
      </Panel>
    </section>
  );
}

/** At most six reads, five seconds apart; no automatic command resubmission. */
export function SelectedReconciliation<T>({
  runtime,
  spec,
  navigation,
}: {
  runtime: Runtime;
  spec: ReadSpec<T>;
  navigation: string;
}) {
  const state = useSyncExternalStore(
    runtime.session.subscribe,
    runtime.session.snapshot,
  );
  const queryKey = ['manager', state.epoch, spec.path];
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) =>
      spec.parse(await runtime.session.read(spec.path, signal)),
    enabled: state.phase === 'ready',
  });
  const controller = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    const stop = () => {
      controller.current?.abort();
      setRunning(false);
    };
    const visibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      controller.current?.abort();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [navigation, spec.path, state.epoch]);
  const reconcile = async () => {
    if (controller.current && !controller.current.signal.aborted) return;
    const current = new AbortController();
    controller.current = current;
    setRunning(true);
    setMessage('Reconciling selected resource…');
    const deadline = setTimeout(() => {
      current.abort();
      if (controller.current === current)
        setMessage(
          'The 30-second reconciliation window ended. Refresh manually when ready.',
        );
    }, 30000);
    try {
      for (let count = 0; count < 6; count++) {
        if (current.signal.aborted || document.hidden) break;
        const projection = await runtime.queries.fetchQuery({
          queryKey,
          staleTime: 0,
          queryFn: async () =>
            spec.parse(await runtime.session.read(spec.path, current.signal)),
        });
        if (
          projection &&
          typeof projection === 'object' &&
          (('authoritative' in projection &&
            projection.authoritative === true) ||
            ('status' in projection && projection.status === 'RESOLVED'))
        )
          break;
        if (count < 5)
          await new Promise<void>((resolve) => {
            const finish = () => {
              clearTimeout(timer);
              current.signal.removeEventListener('abort', finish);
              resolve();
            };
            const timer = setTimeout(finish, 5000);
            current.signal.addEventListener('abort', finish, { once: true });
            if (current.signal.aborted) finish();
          });
      }
      if (!current.signal.aborted)
        setMessage(
          'Bounded reconciliation ended. Manual refresh remains available.',
        );
    } catch {
      if (!current.signal.aborted)
        setMessage(
          'Reconciliation stopped after a read error. Refresh manually when ready.',
        );
    } finally {
      clearTimeout(deadline);
      if (controller.current === current) {
        current.abort();
        setRunning(false);
      }
    }
  };
  return (
    <Panel title="Selected operation reconciliation" note={spec.scope}>
      <button
        disabled={running || query.isFetching}
        onClick={() => {
          void reconcile();
        }}
      >
        Reconcile for up to 30 seconds
      </button>
      <button
        className="secondary"
        onClick={() => {
          controller.current?.abort();
          setRunning(false);
          setMessage('Reconciliation stopped.');
        }}
      >
        Stop reconciliation
      </button>
      <button
        className="secondary"
        disabled={running || query.isFetching}
        onClick={() => {
          void query.refetch();
        }}
      >
        Refresh selected operation
      </button>
      <p role="status">{message}</p>
      {query.isFetching ? (
        <p>Reading current state…</p>
      ) : query.error ? (
        <p role="alert">
          Current state unavailable. Previous results are hidden.
        </p>
      ) : query.data ? (
        <Projection value={query.data} />
      ) : null}
    </Panel>
  );
}
function Projection({ value }: { value: unknown }) {
  try {
    const data = dto.failureDetail(value);
    return (
      <>
        <Status value={data.status} />
        <p>
          Incident version {data.version} · rider{' '}
          <Reference value={data.rider_id} />
        </p>
        <Table
          caption="Recovery assignment outcomes in this page"
          columns={[
            'Assignment',
            'State',
            'Activation / revision',
            'Acknowledgment',
            'Failure',
          ]}
          rows={data.assignments.map((row) => [
            <Reference value={row.assignment_id} />,
            <Status value={row.status} />,
            <>
              <Reference value={row.activation_revision_id} />
              <Reference value={row.revision_id} />
            </>,
            <>
              {row.acknowledged
                ? 'Acknowledged'
                : 'Acknowledgment outstanding where a revision exists'}
              <Time value={row.acknowledgment_due_at} />
              <Time value={row.receipt_escalated_at} />
            </>,
            <Status value={row.failure_code} />,
          ])}
        />
        <Table
          caption="Recovery obligation outcomes in this page"
          columns={[
            'Replacement',
            'State',
            'Activation',
            'Custody transferred',
          ]}
          rows={data.obligations.map((row) => [
            <Reference value={row.replacement_id} />,
            <Status value={row.status} />,
            <Reference value={row.activation_id} />,
            row.custody_transferred ? 'Yes' : 'No',
          ])}
        />
        {(data.next_cursor || data.assignment_next_cursor) && (
          <p>
            More pages exist. This is not an incident-wide completion
            assessment.
          </p>
        )}
      </>
    );
  } catch {
    /* Other independently validated read shapes below. */
  }
  try {
    const data = dto.replacementDetail(value);
    return (
      <>
        <Reference value={data.replacement_id} />
        <Status value={data.status} />
        <Status value={data.activation_state} />
        <Reference value={data.activation_id} />
        <p>
          Backend authoritative: {data.authoritative ? 'Yes' : 'No'} · custody
          transferred: {data.custody_transferred ? 'Yes' : 'No'}
        </p>
      </>
    );
  } catch {
    /* Not a replacement projection. */
  }
  try {
    const data = dto.recoveryState(value);
    return (
      <>
        <Reference value={data.rider_id} />
        {data.routes.map((row) => (
          <p key={row.route_id}>
            <Reference value={row.route_id} /> v{row.version}{' '}
            <Status value={row.status} />
          </p>
        ))}
        {data.open_incidents.map((id) => (
          <Reference key={id} value={id} />
        ))}
      </>
    );
  } catch {
    /* Not rider state. */
  }
  const data = dto.bookingLineage(value);
  return (
    <>
      <Reference value={data.request_id} />
      {data.assignments.map((row) => (
        <p key={row.assignment_id}>
          <Reference value={row.assignment_id} />
          <Reference value={row.rider_id} />
          <Status value={row.status} />
        </p>
      ))}
    </>
  );
}
