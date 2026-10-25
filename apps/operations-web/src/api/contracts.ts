import {
  bool,
  integer,
  list,
  nullable,
  object,
  text,
  timestamp,
  uuid,
  type Decoded,
} from './schema';

export const principal = object({ user_id: uuid, roles: list(text, 30) });
export const rider = object({
  rider_id: uuid,
  profile_status: text,
  vehicle_type_code: nullable(text),
  capacity_class_code: nullable(text),
  availability_intent: text,
  work_state: text,
  version: integer,
  updated_at: timestamp,
});
export const group = object({
  collection_group_id: uuid,
  planning_batch_id: uuid,
  planning_mode: text,
  cell_id: text,
  slot_start: timestamp,
  slot_end: timestamp,
  pickup_count: integer,
  created_at: timestamp,
});
export const incident = object({
  incident_id: uuid,
  client_incident_id: uuid,
  pickup_execution_id: uuid,
  rider_assignment_id: uuid,
  reason_code: text,
  status: text,
  opened_at: timestamp,
});
export const route = object({
  route_id: uuid,
  vehicle_id: uuid,
  assignment_id: uuid,
  revision_id: uuid,
  status: text,
  tasks: list(
    object({
      task_id: uuid,
      pickup_execution_id: uuid,
      kind: text,
      state: text,
      committed_at: nullable(timestamp),
      receiving_point_id: nullable(uuid),
      planned_start: timestamp,
      planned_end: timestamp,
    }),
  ),
});
export const recoveryState = object({
  rider_id: uuid,
  routes: list(
    object({
      route_id: uuid,
      version: integer,
      status: text,
      shift_id: uuid,
      vehicle_id: uuid,
    }),
  ),
  open_incidents: list(uuid),
});
export const replacement = object({
  replacement_id: uuid,
  request_id: uuid,
  incident_id: nullable(uuid),
  status: text,
  version: integer,
  requested_at: timestamp,
  failure_code: nullable(text),
  activation_id: nullable(uuid),
});
export const replacements = object({
  items: list(replacement, 100),
  next_cursor: nullable(uuid),
});
export const candidate = object({
  candidate_id: uuid,
  rank: integer,
  selectable: bool,
  rider_id: uuid,
  vehicle_id: uuid,
  shift_id: uuid,
  region_id: uuid,
  resource_kind: text,
  affected_bookings: (value) =>
    value === undefined ? undefined : list(uuid, 100)(value),
  route_versions: (value) =>
    value === undefined
      ? undefined
      : list(object({ route_id: uuid, version: integer }), 1000)(value),
});
export const evaluation = object({
  evaluation_id: uuid,
  outcome: text,
  source_version: integer,
  region_version: integer,
  source_fingerprint: text,
  created_at: timestamp,
  expires_at: timestamp,
  current: bool,
});
export const replacementDetail = object({
  replacement_id: uuid,
  request_id: uuid,
  status: text,
  version: integer,
  original_rider_id: uuid,
  requested_by: nullable(uuid),
  requested_at: timestamp,
  reason: nullable(text),
  incident_id: nullable(uuid),
  recommended_shift_id: nullable(uuid),
  recommended_at: nullable(timestamp),
  source_version: nullable(integer),
  selected_candidate_id: nullable(uuid),
  selection_refresh_available: bool,
  decided_by: nullable(uuid),
  decided_at: nullable(timestamp),
  activation_id: nullable(uuid),
  activated_at: nullable(timestamp),
  transfer_intent_id: nullable(uuid),
  custody_transferred: bool,
  authoritative: bool,
  failure_code: nullable(text),
  activation_state: text,
  evaluation: nullable(evaluation),
  candidates: list(candidate, 100),
  next_cursor: nullable(integer),
});
export const evaluations = object({
  evaluations: list(
    object({
      evaluation_id: uuid,
      source_version: integer,
      region_version: integer,
      source_fingerprint: text,
      created_at: timestamp,
      expires_at: timestamp,
      outcome: text,
      is_latest: bool,
    }),
    100,
  ),
  next_cursor: nullable(uuid),
});
export const capacity = object({
  region_id: uuid,
  region_version: integer,
  resources: list(
    object({
      vehicle_id: uuid,
      membership_version: integer,
      shift_id: nullable(uuid),
      rider_id: nullable(uuid),
      starts_at: nullable(timestamp),
      ends_at: nullable(timestamp),
    }),
    500,
  ),
  next_cursor: nullable(uuid),
});
export const backlog = object({
  items: list(
    object({
      request_id: uuid,
      status: text,
      slot_start: timestamp,
      slot_end: timestamp,
      manifest_ready: bool,
      load_uncertain: bool,
    }),
    100,
  ),
  next_request_id: nullable(uuid),
});
export const fleetStatus = object({
  policy_version: nullable(integer),
  next_due_at: nullable(timestamp),
  cycles: list(
    object({
      cycle_id: uuid,
      status: text,
      failure_code: nullable(text),
      activation_id: nullable(uuid),
    }),
    50,
  ),
  exceptions: list(
    object({
      exception_id: uuid,
      request_id: nullable(uuid),
      route_id: nullable(uuid),
      reason: text,
      created_at: timestamp,
    }),
    100,
  ),
});
export const failureDetail = object({
  incident_id: uuid,
  rider_id: uuid,
  version: integer,
  status: text,
  obligations: list(
    object({
      replacement_id: uuid,
      request_id: uuid,
      status: text,
      failure_code: nullable(text),
      activation_id: nullable(uuid),
      transfer_intent_id: nullable(uuid),
      custody_transferred: bool,
    }),
    100,
  ),
  next_cursor: nullable(uuid),
  assignments: list(
    object({
      assignment_id: uuid,
      shift_id: uuid,
      status: text,
      version: integer,
      failure_code: nullable(text),
      activation_id: nullable(uuid),
      decision: text,
      rendezvous: text,
      activation_revision_id: nullable(uuid),
      revision_id: nullable(uuid),
      acknowledged: bool,
      acknowledgment_due_at: nullable(timestamp),
      receipt_escalated_at: nullable(timestamp),
    }),
    100,
  ),
  assignment_next_cursor: nullable(uuid),
});
export type Rider = Decoded<typeof rider>;
export const regions = object({
  items: list(
    object({
      entity_id: uuid,
      revision: integer,
      is_current: bool,
      resulting_state: object({
        region_id: uuid,
        name: text,
        version: integer,
        default_warehouse_id: uuid,
      }),
    }),
    100,
  ),
  next_cursor: nullable(uuid),
});
export const bookingLineage = object({
  request_id: uuid,
  pickup_execution_id: uuid,
  pickup_status: text,
  assignments: list(
    object({
      assignment_id: uuid,
      rider_id: uuid,
      status: text,
      assigned_at: timestamp,
      started_at: nullable(timestamp),
      completed_at: nullable(timestamp),
      supersedes_assignment_id: nullable(uuid),
      released_at: nullable(timestamp),
      release_reason_code: nullable(text),
      route_id: nullable(uuid),
      vehicle_id: nullable(uuid),
      current_route_version: nullable(integer),
    }),
    100,
  ),
  next_cursor: nullable(uuid),
});
export const custodyTransfers = object({
  items: list(
    object({
      transfer_id: uuid,
      intent_id: uuid,
      sequence: integer,
      request_id: uuid,
      from_vehicle_id: uuid,
      to_vehicle_id: uuid,
      from_rider_id: uuid,
      to_rider_id: uuid,
      donor_evidence_id: uuid,
      receiver_evidence_id: uuid,
      authorized_by: uuid,
      confirmed_by: uuid,
      transferred_at: timestamp,
    }),
    100,
  ),
  next_cursor: nullable(uuid),
});
export type Principal = Decoded<typeof principal>;
