import { ManagerSession, type WebSessionAdapter } from '../auth/session';
import { createRuntime } from '../runtime';

export const FIXTURE_SCENARIO_MARKER_OW_P0_01 =
  'Fixtures never establish backend acceptance.';
export const scenarios = [
  'Normal workload',
  'Empty region',
  'Open pickup incident',
  'Rider failure',
  'Recovery pending',
  'Recovery options available',
  'Recovery needs attention',
  'Reassignment completed',
  'Backend unavailable',
] as const;
export type Scenario = (typeof scenarios)[number];
export const fixtureId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = '2026-10-24T04:00:00Z',
  end = '2026-10-24T07:00:00Z';
const grant = {
  access_token: 'FIXTURE_ONLY_NEVER_A_REAL_CREDENTIAL',
  token_type: 'bearer',
  expires_in: 3600,
  user_id: fixtureId(99),
};
const evaluation = {
  evaluation_id: fixtureId(51),
  outcome: 'VALIDATED_OPTIONS',
  source_version: 6,
  region_version: 2,
  source_fingerprint: '00'.repeat(32),
  created_at: at,
  expires_at: end,
  current: true,
  search: {},
};

export function fixturePayload(path: string, scenario: Scenario): unknown {
  const base = path.split('?')[0],
    empty = scenario === 'Empty region',
    failed = [
      'Rider failure',
      'Recovery pending',
      'Recovery options available',
      'Recovery needs attention',
    ].includes(scenario),
    completed = scenario === 'Reassignment completed';
  const now = Date.now();
  const evaluated = {
    ...evaluation,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 300000).toISOString(),
    current: !completed,
  };
  if (base === '/v1/auth/me')
    return { user_id: fixtureId(99), roles: ['MANAGER'] };
  if (base === '/v1/manager/business/operating_region')
    return {
      items: empty
        ? []
        : [
            {
              entity_id: fixtureId(60),
              revision: 3,
              is_current: true,
              resulting_state: {
                region_id: fixtureId(60),
                name: 'Demonstration operating region',
                version: 2,
                default_warehouse_id: fixtureId(38),
              },
            },
          ],
      next_cursor: null,
    };
  if (/\/business\/bookings\/[^/]+\/lineage$/.test(base))
    return {
      request_id: base.split('/')[5],
      pickup_execution_id: fixtureId(22),
      pickup_status: completed ? 'COLLECTED' : 'ASSIGNED',
      assignments: empty
        ? []
        : [
            {
              assignment_id: fixtureId(completed ? 39 : 33),
              rider_id: fixtureId(completed ? 1 : 2),
              status: 'ACTIVE',
              assigned_at: at,
              started_at: completed ? null : at,
              completed_at: null,
              supersedes_assignment_id: completed ? fixtureId(33) : null,
              released_at: null,
              release_reason_code: null,
              route_id: fixtureId(30),
              vehicle_id: fixtureId(completed ? 72 : 32),
              current_route_version: completed ? 4 : 3,
            },
          ],
      next_cursor: null,
      pickup_attempts: [],
      replacements: [],
      decisions: [],
      custody_transfers: [],
      related_history_limits: {
        attempts: 100,
        replacements: 100,
        decisions: 200,
        transfers: 100,
      },
    };
  if (/\/business\/bookings\/[^/]+\/events\/transfers$/.test(base))
    return {
      items: completed
        ? [
            {
              transfer_id: fixtureId(100),
              intent_id: fixtureId(57),
              sequence: 1,
              request_id: base.split('/')[5],
              from_vehicle_id: fixtureId(32),
              to_vehicle_id: fixtureId(72),
              from_rider_id: fixtureId(2),
              to_rider_id: fixtureId(1),
              donor_evidence_id: fixtureId(101),
              receiver_evidence_id: fixtureId(102),
              authorized_by: fixtureId(99),
              confirmed_by: fixtureId(1),
              transferred_at: at,
            },
          ]
        : [],
      next_cursor: null,
    };
  if (base === '/v1/manager/riders')
    return empty
      ? []
      : [
          {
            rider_id: fixtureId(1),
            profile_status: 'ACTIVE',
            vehicle_type_code: 'E_CART',
            capacity_class_code: 'STANDARD',
            availability_intent: 'AVAILABLE',
            work_state: completed ? 'BUSY' : 'IDLE',
            version: 2,
            updated_at: at,
          },
          {
            rider_id: fixtureId(2),
            profile_status: 'ACTIVE',
            vehicle_type_code: 'E_CART',
            capacity_class_code: 'STANDARD',
            availability_intent: failed || completed ? 'OFFLINE' : 'AVAILABLE',
            work_state: completed ? 'IDLE' : 'BUSY',
            version: 4,
            updated_at: at,
          },
          {
            rider_id: fixtureId(3),
            profile_status: 'ACTIVE',
            vehicle_type_code: 'VAN',
            capacity_class_code: 'LARGE',
            availability_intent: 'AVAILABLE',
            work_state: 'RESERVED',
            version: 3,
            updated_at: at,
          },
        ];
  if (base === '/v1/manager/collection-groups/pending-assignment')
    return empty || completed
      ? []
      : [0, 1].map((n) => ({
          collection_group_id: fixtureId(10 + n),
          planning_batch_id: fixtureId(15),
          planning_mode: n ? 'FALLBACK_SINGLETON' : 'COMPACTED',
          cell_id: n ? 'DEMO-CELL-B' : 'DEMO-CELL-A',
          slot_start: at,
          slot_end: end,
          pickup_count: n ? 1 : 4,
          created_at: at,
        }));
  if (base === '/v1/manager/incidents')
    return scenario === 'Open pickup incident'
      ? [
          {
            incident_id: fixtureId(20),
            client_incident_id: fixtureId(21),
            pickup_execution_id: fixtureId(122),
            rider_assignment_id: fixtureId(123),
            reason_code: 'RIDER_UNABLE_TO_CONTINUE',
            status: 'OPEN',
            opened_at: at,
          },
        ]
      : [];
  if (/\/riders\/[^/]+\/recovery-state$/.test(base))
    return {
      rider_id: base.split('/')[4],
      routes:
        empty || base.split('/')[4] !== fixtureId(completed ? 1 : 2)
          ? []
          : [
              {
                route_id: fixtureId(30),
                version: 3,
                status: failed ? 'RECOVERY_REQUIRED' : 'ACTIVE',
                shift_id: fixtureId(completed ? 73 : 31),
                vehicle_id: fixtureId(completed ? 72 : 32),
              },
            ],
      open_incidents:
        failed && base.split('/')[4] === fixtureId(2) ? [fixtureId(40)] : [],
    };
  if (/\/routes\/[^/]+$/.test(base))
    return {
      route_id: base.split('/').at(-1),
      vehicle_id: fixtureId(completed ? 72 : 32),
      assignment_id: fixtureId(completed ? 39 : 33),
      revision_id: fixtureId(completed ? 35 : 34),
      status: failed ? 'RECOVERY_REQUIRED' : 'ACTIVE',
      tasks: empty
        ? []
        : (completed ? [1] : [0, 1]).map((n) => ({
            task_id: fixtureId(36 + n),
            pickup_execution_id: fixtureId(22),
            kind: n ? 'DISCHARGE' : 'PICKUP',
            state: 'PENDING',
            committed_at: completed ? at : null,
            receiving_point_id: n ? fixtureId(38) : null,
            planned_start: at,
            planned_end: end,
          })),
    };
  const replacementState = completed
    ? 'COMPLETED'
    : scenario === 'Recovery pending' || scenario === 'Recovery needs attention'
      ? 'APPROVED'
      : failed && scenario !== 'Recovery options available'
        ? 'REQUESTED'
        : 'RECOMMENDED';
  const row = {
    replacement_id: fixtureId(50),
    request_id: fixtureId(55),
    incident_id: null,
    status: replacementState,
    version: 3,
    requested_at: at,
    failure_code: null,
    activation_id: completed ? fixtureId(56) : null,
  };
  if (base === '/v2/manager/replacements')
    return { items: empty ? [] : [row], next_cursor: null };
  if (/\/replacements\/[^/]+\/evaluations$/.test(base))
    return {
      evaluations: empty || failed ? [] : [{ ...evaluated, is_latest: true }],
      next_cursor: null,
    };
  if (/\/replacements\/[^/]+$/.test(base))
    return {
      ...row,
      original_rider_id: fixtureId(2),
      requested_by: fixtureId(99),
      reason: 'VEHICLE_UNAVAILABLE',
      recommended_shift_id: failed ? null : fixtureId(31),
      recommended_at: failed ? null : at,
      source_version: failed ? null : 6,
      selected_candidate_id:
        completed || scenario === 'Recovery pending' ? fixtureId(52) : null,
      selection_refresh_available: false,
      decided_by: completed ? fixtureId(99) : null,
      decided_at: completed ? at : null,
      activated_at: completed ? at : null,
      transfer_intent_id: completed ? fixtureId(57) : null,
      custody_transferred: completed,
      authoritative: completed,
      activation_state: completed
        ? 'ACTIVATED'
        : scenario === 'Recovery pending'
          ? 'PENDING'
          : 'NOT_AUTHORIZED',
      evaluation:
        failed && scenario !== 'Recovery options available' ? null : evaluated,
      candidates:
        empty || (failed && scenario !== 'Recovery options available')
          ? []
          : [
              {
                candidate_id: fixtureId(52),
                rank: 1,
                selectable: !completed && replacementState === 'RECOMMENDED',
                rider_id: fixtureId(1),
                vehicle_id: fixtureId(72),
                shift_id: fixtureId(73),
                region_id: fixtureId(60),
                resource_kind: 'COMMITTED',
                affected_bookings: [fixtureId(55)],
                route_versions: [{ route_id: fixtureId(30), version: 3 }],
              },
            ],
      next_cursor: null,
    };
  if (/\/regions\/[^/]+\/capacity$/.test(base))
    return {
      region_id: base.split('/')[4],
      region_version: 2,
      resources: empty
        ? []
        : [
            {
              vehicle_id: fixtureId(32),
              membership_version: 2,
              shift_id: fixtureId(31),
              rider_id: fixtureId(2),
              starts_at: at,
              ends_at: end,
            },
            {
              vehicle_id: fixtureId(72),
              membership_version: 2,
              shift_id: fixtureId(73),
              rider_id: fixtureId(1),
              starts_at: at,
              ends_at: end,
            },
          ],
      next_cursor: null,
    };
  if (base === '/v2/manager/fleet/backlog')
    return {
      items: empty
        ? []
        : [
            {
              request_id: fixtureId(65),
              status: 'ACCEPTED',
              slot_start: at,
              slot_end: end,
              manifest_ready: true,
              load_uncertain: false,
            },
          ],
      next_request_id: null,
    };
  if (base === '/v2/manager/fleet/status')
    return {
      policy_version: empty ? null : 2,
      next_due_at: empty ? null : end,
      cycles: empty
        ? []
        : [
            {
              cycle_id: fixtureId(70),
              status: 'ACTIVATED',
              failure_code: null,
              activation_id: fixtureId(56),
              measurements: {},
            },
          ],
      exceptions: failed
        ? [
            {
              exception_id: fixtureId(71),
              request_id: fixtureId(55),
              route_id: fixtureId(30),
              reason: 'RIDER_UNAVAILABLE',
              created_at: at,
            },
          ]
        : [],
    };
  if (/\/rider-failures\/[^/]+$/.test(base))
    return {
      incident_id: base.split('/').at(-1),
      rider_id: fixtureId(2),
      version: 2,
      status: completed ? 'RESOLVED' : 'OPEN',
      obligations: empty
        ? []
        : [
            {
              replacement_id: fixtureId(50),
              request_id: fixtureId(55),
              status: replacementState,
              failure_code: null,
              activation_id: row.activation_id,
              transfer_intent_id: completed ? fixtureId(57) : null,
              custody_transferred: completed,
            },
          ],
      next_cursor: null,
      assignments:
        scenario === 'Recovery pending' ||
        scenario === 'Recovery needs attention' ||
        completed
          ? [
              {
                assignment_id: fixtureId(80),
                shift_id: fixtureId(73),
                status: completed
                  ? 'ACTIVATED'
                  : scenario === 'Recovery needs attention'
                    ? 'ATTENTION'
                    : 'PENDING',
                version: 2,
                failure_code:
                  scenario === 'Recovery needs attention'
                    ? 'ACTIVE_SHIFT_REQUIRED'
                    : null,
                activation_id: row.activation_id,
                decision: 'RECORDED',
                rendezvous: 'MANAGER_COORDINATED',
                activation_revision_id: completed ? fixtureId(35) : null,
                revision_id: completed ? fixtureId(35) : null,
                acknowledged: completed,
                acknowledgment_due_at: completed ? end : null,
                receipt_escalated_at: null,
              },
            ]
          : [],
      assignment_next_cursor: null,
    };
  throw new Error('Unknown fixture read.');
}
export function fixtureRuntime(initial: Scenario = 'Normal workload') {
  let current = initial;
  const replay = new Map<
    string,
    { payload: string; body: unknown; status: number }
  >();
  const assigned = new Set<string>();
  const adapter: WebSessionAdapter = {
    available: true,
    startOtp: async () => {
      throw new Error('No OTP in fixtures.');
    },
    verifyOtp: async () => {
      throw new Error('No OTP in fixtures.');
    },
    refresh: async () => grant,
    logout: async () => {},
  };
  const fixtureFetch: typeof fetch = async (input, options) => {
    const url = new URL(String(input));
    if (
      url.origin !== 'https://fixture.invalid' ||
      !['GET', 'POST'].includes(options?.method ?? '')
    )
      throw new Error('Fixture isolation violation.');
    if (options?.signal?.aborted) throw new Error('Cancelled.');
    if (options?.method === 'POST') {
      // Pure in-memory simulation. Never delegates to fetch or any real transport.
      const payload = String(options.body);
      const request = JSON.parse(payload) as Record<string, unknown>;
      const key =
        url.pathname +
        ':' +
        String(
          request.client_command_id ??
            request.client_reassignment_id ??
            payload,
        );
      let recorded = replay.get(key);
      if (recorded && recorded.payload !== payload)
        return {
          status: 409,
          ok: false,
          json: async () => ({ detail: 'COMMAND_CONFLICT' }),
        } as Response;
      if (!recorded) {
        let body: unknown,
          status = 200;
        if (
          /\/collection-groups\/[^/]+\/assign$/.test(url.pathname) ||
          /\/assignments\/[^/]+\/reassign$/.test(url.pathname)
        ) {
          const group = url.pathname.includes('collection-groups')
            ? url.pathname.split('/')[4]
            : fixtureId(10);
          assigned.add(group);
          body = {
            assignment_id: fixtureId(
              url.pathname.includes('reassign') ? 91 : 90,
            ),
            collection_group_id: group,
            rider_id: request.rider_id ?? request.replacement_rider_id,
            source: 'MANAGER_ASSIGNED',
            status: 'ACTIVE',
            assigned_at: new Date().toISOString(),
            started_at: null,
            completed_at: null,
          };
        } else if (url.pathname === '/v2/manager/rider-failures') {
          status = 202;
          body = {
            resource_id:
              request.operation === 'RETRY_RECOVERY'
                ? request.assignment_id
                : request.operation === 'RESOLVE_FAILED_PICKUP'
                  ? request.replacement_id
                  : request.operation === 'APPROVE_RECOVERY'
                    ? request.incident_id
                    : fixtureId(40),
          };
          current =
            request.operation === 'APPROVE_RECOVERY' ||
            request.operation === 'RETRY_RECOVERY'
              ? 'Recovery pending'
              : 'Rider failure';
        } else if (/\/replacements\/[^/]+\/select$/.test(url.pathname)) {
          current = 'Recovery pending';
          body = fixturePayload(
            `/v2/manager/replacements/${url.pathname.split('/')[4]}`,
            current,
          );
        } else throw new Error('Unknown fixture command.');
        recorded = { payload, body, status };
        replay.set(key, recorded);
      }
      return {
        status: recorded.status,
        ok: true,
        json: async () => structuredClone(recorded.body),
      } as Response;
    }
    const status =
      current === 'Backend unavailable' && url.pathname !== '/v1/auth/me'
        ? 503
        : 200;
    let body =
      status === 200 ? fixturePayload(url.pathname + url.search, current) : {};
    if (
      url.pathname === '/v1/manager/collection-groups/pending-assignment' &&
      Array.isArray(body)
    )
      body = body.filter(
        (row: { collection_group_id: string }) =>
          !assigned.has(row.collection_group_id),
      );
    return {
      status,
      ok: status === 200,
      json: async () => structuredClone(body),
    } as Response;
  };
  const runtime = createRuntime(
    'fixture',
    new ManagerSession(adapter, 'https://fixture.invalid', fixtureFetch),
    { dispatch: true, fleet: true, orchestration: true },
  );
  runtime.preview = {
    scenarios,
    current: () => current,
    routeId: fixtureId(30),
    references: {
      Route: fixtureId(30),
      Region: fixtureId(60),
      Replacement: fixtureId(50),
      'V2 failure incident': fixtureId(40),
      Booking: fixtureId(55),
    },
    async change(value) {
      if (!scenarios.includes(value as Scenario)) return;
      await runtime.session.logout();
      current = value as Scenario;
      replay.clear();
      assigned.clear();
      await runtime.session.restore();
    },
  };
  return runtime;
}
