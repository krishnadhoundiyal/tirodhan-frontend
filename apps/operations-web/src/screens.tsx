import { useState } from 'react';
import { reads } from './api/reads';
import type { Runtime } from './runtime';
import {
  Gap,
  Lookup,
  Pager,
  Panel,
  ReadPanel,
  Reference,
  Status,
  Table,
  Time,
} from './ui';

type ScreenProps = { runtime: Runtime };
const yes = (value: boolean) => (value ? 'Yes' : 'No');

export function Overview({ runtime }: ScreenProps) {
  return (
    <>
      <div className="intro">
        <p className="eyebrow">Collection operations</p>
        <h1>Operations overview</h1>
        <p>
          Review the work that needs attention. Each panel reports its own
          backend scope.
        </p>
      </div>
      <div className="overview-grid">
        <ReadPanel
          runtime={runtime}
          title="Rider snapshot"
          spec={reads.riders()}
        >
          {(rows) => (
            <>
              <p className="metric">
                {rows.length}
                <span>riders in this response</span>
              </p>
              <div className="inline-counts">
                {['IDLE', 'RESERVED', 'BUSY'].map((state) => (
                  <span key={state}>
                    <strong>
                      {rows.filter((row) => row.work_state === state).length}
                    </strong>{' '}
                    {state}
                  </span>
                ))}
              </div>
              <p className="scope">
                Intent and work state are separate; these are not eligibility or
                region-wide totals.
              </p>
            </>
          )}
        </ReadPanel>
        <ReadPanel
          runtime={runtime}
          title="Pending groups"
          spec={reads.groups()}
        >
          {(rows) => (
            <>
              <p className="metric">
                {rows.length}
                <span>pending groups in this response</span>
              </p>
              <p>
                Unassigned V1 groups awaiting assignment. Offered and committed
                route work are not represented by this list.
              </p>
            </>
          )}
        </ReadPanel>
        <ReadPanel
          runtime={runtime}
          title="Open incidents"
          spec={reads.incidents()}
        >
          {(rows) => (
            <>
              <p className="metric">
                {rows.length}
                <span>open incidents in this response</span>
              </p>
              {rows.length ? (
                <ul className="incident-list">
                  {rows.slice(0, 3).map((row) => (
                    <li key={row.incident_id}>
                      <Status value={row.reason_code} />
                      <Reference value={row.incident_id} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No open pickup incidents returned.</p>
              )}
            </>
          )}
        </ReadPanel>
      </div>
      {runtime.capabilities.fleet ? (
        <FleetStatus runtime={runtime} />
      ) : (
        <Gap title="Fleet read not configured">
          Fleet visibility requires the verified V2 fleet and dispatch feature
          flags.
        </Gap>
      )}
      <Gap title="An overview is not a global total">
        There is no manager overview aggregation API. Rider, pending-group and
        incident reads are independently capped, without region filters or
        totals. Cross-panel reads are not an atomic snapshot.
      </Gap>
    </>
  );
}
export function Riders({
  runtime,
  openRoute,
}: ScreenProps & { openRoute: (id: string) => void }) {
  const [selected, setSelected] = useState<string>();
  const [filter, setFilter] = useState('ALL');
  return (
    <>
      <h1>Rider operations</h1>
      <p>
        Availability is a rider's intent. Work state records current operational
        engagement.
      </p>
      <ReadPanel runtime={runtime} title="Riders" spec={reads.riders()}>
        {(rows) => (
          <>
            <label className="filter">
              Work state in loaded slice
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="ALL">All returned states</option>
                {[...new Set(rows.map((row) => row.work_state))].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </label>
            <Table
              caption="Riders · backend ID order"
              columns={[
                'Rider reference',
                'Profile',
                'Availability intent',
                'Work state',
                'Vehicle / capacity',
                'Version / updated',
                'Recovery',
              ]}
              rows={rows
                .filter((row) => filter === 'ALL' || row.work_state === filter)
                .map((row) => [
                  <Reference value={row.rider_id} />,
                  <Status value={row.profile_status} />,
                  <Status value={row.availability_intent} />,
                  <Status value={row.work_state} />,
                  <>
                    {row.vehicle_type_code ?? 'Not recorded'} /{' '}
                    {row.capacity_class_code ?? 'Not recorded'}
                  </>,
                  <>
                    v{row.version}
                    <br />
                    <Time value={row.updated_at} />
                  </>,
                  runtime.capabilities.orchestration ? (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setSelected(row.rider_id)}
                    >
                      Read recovery state
                    </button>
                  ) : (
                    'Read not configured'
                  ),
                ])}
            />
          </>
        )}
      </ReadPanel>
      {selected && runtime.capabilities.orchestration && (
        <ReadPanel
          runtime={runtime}
          title="Rider recovery state"
          spec={reads.recovery(selected)}
        >
          {(data) => (
            <>
              <Reference value={data.rider_id} />
              <Table
                caption="Non-closed routes for selected rider"
                columns={['Route', 'Version', 'State', 'Shift', 'Vehicle']}
                rows={data.routes.map((row) => [
                  <button
                    className="text-button"
                    onClick={() => openRoute(row.route_id)}
                  >
                    {row.route_id}
                  </button>,
                  row.version,
                  <Status value={row.status} />,
                  <Reference value={row.shift_id} />,
                  <Reference value={row.vehicle_id} />,
                ])}
              />
              <h3>Open failure incident references</h3>
              {data.open_incidents.length ? (
                <ul>
                  {data.open_incidents.map((id) => (
                    <li key={id}>
                      <Reference value={id} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No open failure incidents returned.</p>
              )}
            </>
          )}
        </ReadPanel>
      )}
      <Gap title="Visibility has limits">
        This read has no rider name, live location, ETA, performance measurement
        or assignment source. RESERVED does not by itself prove an accepted
        offer; BUSY does not identify a route.
      </Gap>
    </>
  );
}
export function Assignments({ runtime }: ScreenProps) {
  const [after, setAfter] = useState<string>();
  return (
    <>
      <h1>Assignments & backlog</h1>
      <p>
        Keep pending work separate from offers, accepted assignments and
        committed route dispatch.
      </p>
      <ReadPanel
        runtime={runtime}
        title="Pending assignment groups"
        spec={reads.groups()}
      >
        {(rows) => (
          <Table
            caption="Unassigned V1 groups · slot and group ID order"
            columns={[
              'Group / batch',
              'Planning mode',
              'Cell',
              'Slot (IST)',
              'Pickups',
              'Created',
            ]}
            rows={rows.map((row) => [
              <>
                <Reference value={row.collection_group_id} />
                <Reference value={row.planning_batch_id} />
              </>,
              <Status value={row.planning_mode} />,
              row.cell_id,
              <>
                <Time value={row.slot_start} />
                <br />
                <Time value={row.slot_end} />
              </>,
              row.pickup_count,
              <Time value={row.created_at} />,
            ])}
          />
        )}
      </ReadPanel>
      <Gap title="Offered and active assignments">
        The backend defines RIDER_OFFER_ACCEPTED, MANAGER_ASSIGNED and
        COMMITTED_DISPATCH as different assignment sources. There is no global
        manager list of active assignments or offers. Known-booking lineage
        below exposes assignment status and ownership history, without the
        source field. Sources cannot be reconstructed from pending groups or
        rider work states.
      </Gap>
      <BookingAssignments runtime={runtime} />
      {runtime.capabilities.fleet ? (
        <ReadPanel
          runtime={runtime}
          title="Fleet backlog"
          spec={reads.backlog(after)}
        >
          {(data) => (
            <>
              <Table
                caption="Unowned backlog requests · request ID order"
                columns={[
                  'Request',
                  'Request state',
                  'Slot (IST)',
                  'Manifest ready',
                  'Load uncertain',
                ]}
                rows={data.items.map((row) => [
                  <Reference value={row.request_id} />,
                  <Status value={row.status} />,
                  <>
                    <Time value={row.slot_start} />
                    <br />
                    <Time value={row.slot_end} />
                  </>,
                  yes(row.manifest_ready),
                  yes(row.load_uncertain),
                ])}
              />
              <Pager
                next={data.next_request_id}
                active={!!after}
                onReset={() => setAfter(undefined)}
                onNext={() => {
                  if (data.next_request_id) setAfter(data.next_request_id);
                }}
              />
            </>
          )}
        </ReadPanel>
      ) : (
        <Gap title="Backlog read not configured">
          V2 fleet reads require the fleet and dispatch server features.
        </Gap>
      )}
    </>
  );
}
export function FleetStatus({ runtime }: ScreenProps) {
  return (
    <ReadPanel runtime={runtime} title="Fleet control" spec={reads.fleet()}>
      {(data) => (
        <>
          <div className="facts">
            <p>
              Policy version{' '}
              <strong>{data.policy_version ?? 'Not configured'}</strong>
            </p>
            <p>
              Next due <Time value={data.next_due_at} />
            </p>
          </div>
          <Table
            caption="Latest fleet cycles · backend created-time order"
            columns={['Cycle', 'State', 'Failure code', 'Activation']}
            rows={data.cycles.map((row) => [
              <Reference value={row.cycle_id} />,
              <Status value={row.status} />,
              <Status value={row.failure_code} />,
              <Reference value={row.activation_id} />,
            ])}
          />
          <Table
            caption="Latest fleet exceptions · backend created-time order"
            columns={['Exception', 'Reason', 'Request / route', 'Created']}
            rows={data.exceptions.map((row) => [
              <Reference value={row.exception_id} />,
              <Status value={row.reason} />,
              <>
                <Reference value={row.request_id} />
                <Reference value={row.route_id} />
              </>,
              <Time value={row.created_at} />,
            ])}
          />
        </>
      )}
    </ReadPanel>
  );
}
export function Routes({
  runtime,
  routeId,
  setRouteId,
}: ScreenProps & { routeId?: string; setRouteId: (id: string) => void }) {
  const [region, setRegion] = useState<string>(),
    [afterVehicle, setAfterVehicle] = useState<string>();
  return (
    <>
      <h1>Routes & regional resources</h1>
      <p>
        Inspect a known route reference or discover a recorded region identity.
        There is no general manager route list. Region configuration snapshots
        are separate from current operational resource reads.
      </p>
      <RegionIndex
        runtime={runtime}
        onSelect={(id) => {
          setRegion(id);
          setAfterVehicle(undefined);
        }}
      />
      {runtime.capabilities.dispatch ? (
        <>
          <Lookup label="Route UUID" onSelect={setRouteId} initial={routeId} />
          {routeId && (
            <ReadPanel
              runtime={runtime}
              title="Current route revision"
              spec={reads.route(routeId)}
            >
              {(data) => (
                <>
                  <div className="facts">
                    <p>
                      Route <Reference value={data.route_id} />
                    </p>
                    <p>
                      Revision <Reference value={data.revision_id} />
                    </p>
                    <p>
                      Vehicle <Reference value={data.vehicle_id} />
                    </p>
                    <p>
                      Assignment reference{' '}
                      <Reference value={data.assignment_id} />
                    </p>
                    <Status value={data.status} />
                  </div>
                  <Table
                    caption="Current revision tasks · backend ordinal order"
                    columns={[
                      'Order',
                      'Task / pickup',
                      'Kind',
                      'State',
                      'Receiving point',
                      'Planned window (IST)',
                      'Committed',
                    ]}
                    rows={data.tasks.map((row, index) => [
                      index + 1,
                      <>
                        <Reference value={row.task_id} />
                        <Reference value={row.pickup_execution_id} />
                      </>,
                      <Status value={row.kind} />,
                      <Status value={row.state} />,
                      <Reference value={row.receiving_point_id} />,
                      <>
                        <Time value={row.planned_start} />
                        <br />
                        <Time value={row.planned_end} />
                      </>,
                      <Time value={row.committed_at} />,
                    ])}
                  />
                  <p className="scope">
                    The route detail returns a revision ID, not a revision
                    version or rider/source metadata. Task completion does not
                    establish collection or handover completion.
                  </p>
                </>
              )}
            </ReadPanel>
          )}
        </>
      ) : (
        <Gap title="Route read not configured">
          The server's dispatch read feature must be verified before use.
        </Gap>
      )}
      {runtime.capabilities.orchestration ? (
        <>
          <Lookup
            label="Region UUID"
            onSelect={(id) => {
              setRegion(id);
              setAfterVehicle(undefined);
            }}
          />
          {region && (
            <ReadPanel
              runtime={runtime}
              title="Regional resources"
              spec={reads.capacity(region, afterVehicle)}
            >
              {(data) => (
                <>
                  <p>
                    Region <Reference value={data.region_id} /> version{' '}
                    {data.region_version}
                  </p>
                  <Table
                    caption="Vehicle membership and unclosed shifts · vehicle ID order"
                    columns={[
                      'Vehicle',
                      'Membership version',
                      'Shift / rider',
                      'Shift window (IST)',
                    ]}
                    rows={data.resources.map((row) => [
                      <Reference value={row.vehicle_id} />,
                      row.membership_version,
                      <>
                        <Reference value={row.shift_id} />
                        <Reference value={row.rider_id} />
                      </>,
                      <>
                        <Time value={row.starts_at} />
                        <br />
                        <Time value={row.ends_at} />
                      </>,
                    ])}
                  />
                  <Pager
                    next={data.next_cursor}
                    active={!!afterVehicle}
                    onReset={() => setAfterVehicle(undefined)}
                    onNext={() => {
                      if (data.next_cursor) setAfterVehicle(data.next_cursor);
                    }}
                  />
                  <p className="scope">
                    Membership and an unclosed shift are not free or certified
                    capacity, current eligibility or a slot guarantee.
                  </p>
                </>
              )}
            </ReadPanel>
          )}
        </>
      ) : null}
      <Gap title="Planning remains a backend workflow">
        This console does not recalculate routes, invoke VROOM/OSM or regional
        planning, select riders, activate revisions or interpret command
        acceptance as recovery completion.
      </Gap>
    </>
  );
}
export function Recovery({ runtime }: ScreenProps) {
  const [after, setAfter] = useState<string>(),
    [selected, setSelected] = useState<string>(),
    [rank, setRank] = useState<number>(),
    [historyAfter, setHistoryAfter] = useState<string>();
  const select = (id: string) => {
    setSelected(id);
    setRank(undefined);
    setHistoryAfter(undefined);
  };
  if (!runtime.capabilities.orchestration)
    return (
      <Gap title="Recovery reads not configured">
        V2 orchestration reads require verified orchestration, fleet and
        dispatch flags. No recovery polling is enabled.
      </Gap>
    );
  return (
    <>
      <h1>Replacement & recovery</h1>
      <p>
        Requested, recommended, approved, activated and physically transferred
        are distinct facts.
      </p>
      <ReadPanel
        runtime={runtime}
        title="Replacement requests"
        spec={reads.replacements(after)}
      >
        {(data) => (
          <>
            <Table
              caption="Replacement requests · replacement ID order"
              columns={[
                'Replacement',
                'Request / incident',
                'State',
                'Version',
                'Failure / activation',
                'Requested',
              ]}
              rows={data.items.map((row) => [
                <button
                  className="text-button"
                  onClick={() => select(row.replacement_id)}
                >
                  {row.replacement_id}
                </button>,
                <>
                  <Reference value={row.request_id} />
                  <Reference value={row.incident_id} />
                </>,
                <Status value={row.status} />,
                row.version,
                <>
                  <Status value={row.failure_code} />
                  <Reference value={row.activation_id} />
                </>,
                <Time value={row.requested_at} />,
              ])}
            />
            <Pager
              next={data.next_cursor}
              active={!!after}
              onReset={() => setAfter(undefined)}
              onNext={() => {
                if (data.next_cursor) setAfter(data.next_cursor);
              }}
            />
          </>
        )}
      </ReadPanel>
      <Lookup label="Replacement UUID" onSelect={select} />
      {selected && (
        <>
          <ReadPanel
            runtime={runtime}
            title="Replacement detail"
            spec={reads.replacement(selected, rank)}
          >
            {(data) => (
              <>
                <div className="facts">
                  <p>
                    Replacement <Reference value={data.replacement_id} />
                  </p>
                  <p>
                    Original rider <Reference value={data.original_rider_id} />
                  </p>
                  <p>
                    Version <strong>{data.version}</strong>
                  </p>
                  <Status value={data.status} />
                  <Status value={data.activation_state} />
                  <p>
                    Backend authoritative:{' '}
                    <strong>{yes(data.authoritative)}</strong>
                  </p>
                  <p>
                    Custody transferred:{' '}
                    <strong>{yes(data.custody_transferred)}</strong>
                  </p>
                  <p>
                    Activation <Reference value={data.activation_id} />
                  </p>
                  <p>
                    Transfer intent{' '}
                    <Reference value={data.transfer_intent_id} />
                  </p>
                  <p>
                    Selected candidate{' '}
                    <Reference value={data.selected_candidate_id} />
                  </p>
                  <Status value={data.failure_code} />
                </div>
                {data.evaluation ? (
                  <div className="evaluation">
                    <h3>Backend evaluation</h3>
                    <Reference value={data.evaluation.evaluation_id} />
                    <Status value={data.evaluation.outcome} />
                    <p>
                      Current: {yes(data.evaluation.current)} · source v
                      {data.evaluation.source_version} · region v
                      {data.evaluation.region_version}
                    </p>
                    <p>
                      Expires <Time value={data.evaluation.expires_at} />
                    </p>
                  </div>
                ) : (
                  <p className="empty">
                    No evaluation recorded. Recommendation may still be pending.
                  </p>
                )}
                <Table
                  caption="Candidate evaluations · backend rank order, read only"
                  columns={[
                    'Rank / candidate',
                    'Rider / shift',
                    'Vehicle / region',
                    'Resource kind',
                    'Backend selectable',
                  ]}
                  rows={data.candidates.map((row) => [
                    <>
                      {row.rank}
                      <Reference value={row.candidate_id} />
                    </>,
                    <>
                      <Reference value={row.rider_id} />
                      <Reference value={row.shift_id} />
                    </>,
                    <>
                      <Reference value={row.vehicle_id} />
                      <Reference value={row.region_id} />
                    </>,
                    <Status value={row.resource_kind} />,
                    <>
                      {yes(row.selectable)} · no selection action in this
                      increment
                    </>,
                  ])}
                />
                <Pager
                  next={data.next_cursor}
                  active={rank !== undefined}
                  onReset={() => setRank(undefined)}
                  onNext={() => {
                    if (data.next_cursor !== null) setRank(data.next_cursor);
                  }}
                />
                <p className="scope">
                  Selectable is a backend snapshot, not an ongoing guarantee. No
                  client eligibility evaluation or candidate reordering is
                  performed.
                </p>
              </>
            )}
          </ReadPanel>
          <ReadPanel
            runtime={runtime}
            title="Evaluation history"
            spec={reads.evaluations(selected, historyAfter)}
          >
            {(data) => (
              <>
                <Table
                  caption="Immutable evaluation history · evaluation ID order"
                  columns={[
                    'Evaluation',
                    'Outcome',
                    'Source / region version',
                    'Latest',
                    'Created / expires',
                  ]}
                  rows={data.evaluations.map((row) => [
                    <Reference value={row.evaluation_id} />,
                    <Status value={row.outcome} />,
                    `${row.source_version} / ${row.region_version}`,
                    yes(row.is_latest),
                    <>
                      <Time value={row.created_at} />
                      <br />
                      <Time value={row.expires_at} />
                    </>,
                  ])}
                />
                <Pager
                  next={data.next_cursor}
                  active={!!historyAfter}
                  onReset={() => setHistoryAfter(undefined)}
                  onNext={() => {
                    if (data.next_cursor) setHistoryAfter(data.next_cursor);
                  }}
                />
              </>
            )}
          </ReadPanel>
        </>
      )}
      <Gap title="Recovery acceptance is asynchronous">
        A rider failure is an event. Backend workers own recommendation,
        activation and receipts. HTTP 202 would only acknowledge acceptance;
        this increment issues no such command and uses manual refresh only.
      </Gap>
    </>
  );
}
export function Incidents({ runtime }: ScreenProps) {
  const [selected, setSelected] = useState<string>(),
    [obligationAfter, setObligationAfter] = useState<string>(),
    [assignmentAfter, setAssignmentAfter] = useState<string>();
  return (
    <>
      <h1>Incidents & handover boundaries</h1>
      <CustodyFacts runtime={runtime} />
      <ReadPanel
        runtime={runtime}
        title="Open pickup incidents"
        spec={reads.incidents()}
      >
        {(rows) => (
          <Table
            caption="Open V1 pickup incidents · opened time and incident ID order"
            columns={[
              'Incident / client reference',
              'Pickup',
              'Assignment attribution',
              'Reason',
              'State',
              'Opened',
            ]}
            rows={rows.map((row) => [
              <>
                <Reference value={row.incident_id} />
                <Reference value={row.client_incident_id} />
              </>,
              <Reference value={row.pickup_execution_id} />,
              <Reference value={row.rider_assignment_id} />,
              <Status value={row.reason_code} />,
              <Status value={row.status} />,
              <Time value={row.opened_at} />,
            ])}
          />
        )}
      </ReadPanel>
      {runtime.capabilities.orchestration && (
        <>
          <Lookup
            label="V2 rider failure incident UUID"
            onSelect={(id) => {
              setSelected(id);
              setObligationAfter(undefined);
              setAssignmentAfter(undefined);
            }}
          />
          {selected && (
            <ReadPanel
              runtime={runtime}
              title="Failure recovery progress"
              spec={reads.failure(selected, obligationAfter, assignmentAfter)}
            >
              {(data) => (
                <>
                  <div className="facts">
                    <p>
                      Incident <Reference value={data.incident_id} />
                    </p>
                    <p>
                      Rider <Reference value={data.rider_id} />
                    </p>
                    <Status value={data.status} />
                    <p>Version {data.version}</p>
                  </div>
                  <Table
                    caption="Failure obligations · replacement ID order"
                    columns={[
                      'Replacement / request',
                      'State / failure',
                      'Activation / transfer intent',
                      'Custody transferred',
                    ]}
                    rows={data.obligations.map((row) => [
                      <>
                        <Reference value={row.replacement_id} />
                        <Reference value={row.request_id} />
                      </>,
                      <>
                        <Status value={row.status} />
                        <Status value={row.failure_code} />
                      </>,
                      <>
                        <Reference value={row.activation_id} />
                        <Reference value={row.transfer_intent_id} />
                      </>,
                      yes(row.custody_transferred),
                    ])}
                  />
                  <Pager
                    next={data.next_cursor}
                    active={!!obligationAfter}
                    onReset={() => setObligationAfter(undefined)}
                    onNext={() => {
                      if (data.next_cursor)
                        setObligationAfter(data.next_cursor);
                    }}
                  />
                  <Table
                    caption="Recovery assignments · assignment ID order"
                    columns={[
                      'Assignment / shift',
                      'State / version',
                      'Activation / current revision',
                      'Acknowledgment',
                      'Failure / rendezvous',
                    ]}
                    rows={data.assignments.map((row) => [
                      <>
                        <Reference value={row.assignment_id} />
                        <Reference value={row.shift_id} />
                      </>,
                      <>
                        <Status value={row.status} /> v{row.version}
                      </>,
                      <>
                        <Reference value={row.activation_revision_id} />
                        <Reference value={row.revision_id} />
                      </>,
                      <>
                        {yes(row.acknowledged)}
                        <br />
                        Due <Time value={row.acknowledgment_due_at} />
                        <br />
                        Escalated <Time value={row.receipt_escalated_at} />
                      </>,
                      <>
                        <Status value={row.failure_code} />
                        <Status value={row.rendezvous} />
                        <Status value={row.decision} />
                      </>,
                    ])}
                  />
                  <Pager
                    next={data.assignment_next_cursor}
                    active={!!assignmentAfter}
                    onReset={() => setAssignmentAfter(undefined)}
                    onNext={() => {
                      if (data.assignment_next_cursor)
                        setAssignmentAfter(data.assignment_next_cursor);
                    }}
                  />
                </>
              )}
            </ReadPanel>
          )}
        </>
      )}
      <Gap title="Receiving-point validation and request completion">
        Known-booking custody transfers are available as immutable facts. There
        is no receiving-point handover validation or collection-request
        completion projection in these operational reads. A pickup incident is
        not a V2 rider-failure incident. Custody transfers and pickup state do
        not prove receiving-point handover or collection completion.
      </Gap>
    </>
  );
}
function BookingAssignments({ runtime }: ScreenProps) {
  const [booking, setBooking] = useState<string>(),
    [after, setAfter] = useState<string>();
  return (
    <>
      <Lookup
        label="Booking UUID for assignment history"
        onSelect={(id) => {
          setBooking(id);
          setAfter(undefined);
        }}
      />
      {booking && (
        <ReadPanel
          runtime={runtime}
          title="Booking assignment lineage"
          spec={reads.lineage(booking, after)}
        >
          {(data) => (
            <>
              <div className="facts">
                <p>
                  Request <Reference value={data.request_id} />
                </p>
                <p>
                  Pickup <Reference value={data.pickup_execution_id} />
                </p>
                <p>
                  Pickup state <Status value={data.pickup_status} />
                </p>
              </div>
              <Table
                caption="Known-booking assignment history · assignment ID order"
                columns={[
                  'Assignment / rider',
                  'State',
                  'Assigned / started / completed',
                  'Released / reason',
                  'Supersedes',
                  'Route / vehicle / version',
                ]}
                rows={data.assignments.map((row) => [
                  <>
                    <Reference value={row.assignment_id} />
                    <Reference value={row.rider_id} />
                  </>,
                  <Status value={row.status} />,
                  <>
                    <Time value={row.assigned_at} />
                    <br />
                    <Time value={row.started_at} />
                    <br />
                    <Time value={row.completed_at} />
                  </>,
                  <>
                    <Time value={row.released_at} />
                    <Status value={row.release_reason_code} />
                  </>,
                  <Reference value={row.supersedes_assignment_id} />,
                  <>
                    <Reference value={row.route_id} />
                    <Reference value={row.vehicle_id} />
                    {row.current_route_version === null
                      ? 'No route version returned'
                      : `v${row.current_route_version}`}
                  </>,
                ])}
              />
              <Pager
                next={data.next_cursor}
                active={!!after}
                onReset={() => setAfter(undefined)}
                onNext={() => {
                  if (data.next_cursor) setAfter(data.next_cursor);
                }}
              />
              <p className="scope">
                A historical assignment is not necessarily current ownership.
                Release timestamps and states are shown without inventing an
                assignment source or collection-request completion.
              </p>
            </>
          )}
        </ReadPanel>
      )}
    </>
  );
}
function RegionIndex({
  runtime,
  onSelect,
}: ScreenProps & { onSelect: (id: string) => void }) {
  const [after, setAfter] = useState<string>();
  return (
    <ReadPanel
      runtime={runtime}
      title="Region configuration index"
      spec={reads.regions(after)}
    >
      {(data) => (
        <>
          <Table
            caption="Recorded region identities · region ID order"
            columns={[
              'Region',
              'Recorded name',
              'History revision',
              'Recorded region version',
              'Warehouse reference',
              'Resources',
            ]}
            rows={data.items.map((row) => [
              <Reference value={row.entity_id} />,
              row.resulting_state.name,
              <>
                {row.revision} ·{' '}
                {row.is_current ? 'latest recorded' : 'historical'}
              </>,
              row.resulting_state.version,
              <Reference value={row.resulting_state.default_warehouse_id} />,
              runtime.capabilities.orchestration ? (
                <button
                  className="text-button"
                  onClick={() => onSelect(row.entity_id)}
                >
                  Read regional resources
                </button>
              ) : (
                'Capacity read not configured'
              ),
            ])}
          />
          <Pager
            next={data.next_cursor}
            active={!!after}
            onReset={() => setAfter(undefined)}
            onNext={() => {
              if (data.next_cursor) setAfter(data.next_cursor);
            }}
          />
          <p className="scope">
            Configuration history identifies regions. It does not certify
            operational capacity, availability or current eligibility.
          </p>
        </>
      )}
    </ReadPanel>
  );
}
function CustodyFacts({ runtime }: ScreenProps) {
  const [booking, setBooking] = useState<string>(),
    [after, setAfter] = useState<string>();
  return (
    <>
      <Lookup
        label="Booking UUID for custody transfers"
        onSelect={(id) => {
          setBooking(id);
          setAfter(undefined);
        }}
      />
      {booking && (
        <ReadPanel
          runtime={runtime}
          title="Booking custody transfers"
          spec={reads.transfers(booking, after)}
        >
          {(data) => (
            <>
              <Table
                caption="Immutable custody transfers · transfer ID order"
                columns={[
                  'Transfer / intent',
                  'Sequence / request',
                  'From rider / vehicle',
                  'To rider / vehicle',
                  'Evidence references',
                  'Authorized / confirmed by',
                  'Transferred',
                ]}
                rows={data.items.map((row) => [
                  <>
                    <Reference value={row.transfer_id} />
                    <Reference value={row.intent_id} />
                  </>,
                  <>
                    {row.sequence}
                    <Reference value={row.request_id} />
                  </>,
                  <>
                    <Reference value={row.from_rider_id} />
                    <Reference value={row.from_vehicle_id} />
                  </>,
                  <>
                    <Reference value={row.to_rider_id} />
                    <Reference value={row.to_vehicle_id} />
                  </>,
                  <>
                    <Reference value={row.donor_evidence_id} />
                    <Reference value={row.receiver_evidence_id} />
                  </>,
                  <>
                    <Reference value={row.authorized_by} />
                    <Reference value={row.confirmed_by} />
                  </>,
                  <Time value={row.transferred_at} />,
                ])}
              />
              <Pager
                next={data.next_cursor}
                active={!!after}
                onReset={() => setAfter(undefined)}
                onNext={() => {
                  if (data.next_cursor) setAfter(data.next_cursor);
                }}
              />
              <p className="scope">
                These persisted transfer facts do not establish receiving-point
                handover validation or collection completion. No evidence
                download or transfer command is issued.
              </p>
            </>
          )}
        </ReadPanel>
      )}
    </>
  );
}
export function Account({ runtime }: ScreenProps) {
  const state = runtime.session.snapshot();
  return (
    <>
      <h1>Account & access</h1>
      <Panel title="Current admission">
        <p>
          {runtime.kind === 'fixture'
            ? 'Development fixture principal; grants no real permission.'
            : 'Principal verified through GET /v1/auth/me.'}
        </p>
        <Reference value={state.principal?.user_id ?? null} />
        <p>Current presentation roles: {state.principal?.roles.join(', ')}</p>
        <button
          onClick={() => {
            void runtime.session.logout();
          }}
        >
          Sign out and clear operational data
        </button>
      </Panel>
      <Gap title="Web authentication prerequisite">
        Production web login is unavailable until the APIM Web Session Adapter
        and its CORS, CSRF, cookie isolation, response redaction and logout
        contracts pass the mandatory POC. Browser-visible refresh tokens are not
        an alternative.
      </Gap>
    </>
  );
}
