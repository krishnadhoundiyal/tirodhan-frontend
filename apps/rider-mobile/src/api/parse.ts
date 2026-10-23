import { ApiError } from './errors';
import type {
  AccessTokenResponse,
  LoginTokenResponse,
  PrincipalResponse,
  Availability,
  Offer,
  Assignment,
  AssignmentEnvelope,
  AssignmentSummary,
  Pickup,
  Route,
  RouteTask,
} from './contracts';
const fail = (): never => {
  throw new ApiError(200, 'protocol');
};
export const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail();
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : fail());
const nullableText = (v: unknown) => (v === null ? null : text(v));
const integer = (v: unknown, min = 1) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min ? v : fail();
const date = (v: unknown) => {
  const s = text(v);
  return /(?:Z|[+-]\d\d:\d\d)$/.test(s) && Number.isFinite(Date.parse(s))
    ? s
    : fail();
};
const nullableDate = (v: unknown) => (v === null ? null : date(v));
const list = <T>(v: unknown, parse: (item: unknown) => T): T[] =>
  Array.isArray(v) ? v.map(parse) : fail();
const coordinate = (v: unknown, max: number) =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max
    ? v
    : fail();
export function parseAccess(v: unknown): AccessTokenResponse {
  const x = object(v);
  return {
    access_token: text(x.access_token),
    token_type: x.token_type === 'bearer' ? x.token_type : fail(),
    expires_in: integer(x.expires_in),
    user_id: text(x.user_id),
  };
}
export function parseLogin(v: unknown): LoginTokenResponse {
  return { ...parseAccess(v), refresh_token: text(object(v).refresh_token) };
}
export function parsePrincipal(v: unknown): PrincipalResponse {
  const x = object(v);
  return { user_id: text(x.user_id), roles: list(x.roles, text) };
}
export function parseChallenge(v: unknown) {
  return { challenge_reference: text(object(v).challenge_reference) };
}
export function parseAvailability(v: unknown): Availability {
  const x = object(v);
  return {
    rider_id: text(x.rider_id),
    availability_intent: text(x.availability_intent),
    work_state: text(x.work_state),
    version: integer(x.version),
    updated_at: date(x.updated_at),
  };
}
export function parseOffer(v: unknown): Offer {
  const x = object(v);
  return {
    offer_id: text(x.offer_id),
    collection_group_id: text(x.collection_group_id),
    offer_round: integer(x.offer_round),
    status: text(x.status),
    offered_at: date(x.offered_at),
    expires_at: date(x.expires_at),
  };
}
export const parseOffers = (v: unknown) => list(v, parseOffer);
const commonAssignment = (x: Record<string, unknown>) => ({
  assignment_id: text(x.assignment_id),
  collection_group_id: nullableText(x.collection_group_id),
  source: text(x.source),
  status: text(x.status),
  assigned_at: date(x.assigned_at),
  started_at: nullableDate(x.started_at),
  completed_at: nullableDate(x.completed_at),
});
export function parseSummary(v: unknown): AssignmentSummary {
  const x = object(v);
  return { ...commonAssignment(x), rider_id: text(x.rider_id) };
}
export function parsePickup(v: unknown): Pickup {
  const x = object(v);
  return {
    pickup_execution_id: text(x.pickup_execution_id),
    request_id: text(x.request_id),
    status: text(x.status),
    slot_start: date(x.slot_start),
    slot_end: date(x.slot_end),
    pickup_address: text(x.pickup_address),
    pickup_latitude: coordinate(x.pickup_latitude, 90),
    pickup_longitude: coordinate(x.pickup_longitude, 180),
    declared_items: list(x.declared_items, (value) => {
      const i = object(value);
      return {
        item_category_code: text(i.item_category_code),
        declared_quantity:
          i.declared_quantity === null ? null : integer(i.declared_quantity),
        declared_weight_grams:
          i.declared_weight_grams === null
            ? null
            : integer(i.declared_weight_grams),
      };
    }),
  };
}
export function parseAssignment(v: unknown): AssignmentEnvelope {
  const x = object(v);
  if (x.assignment === null) return { assignment: null };
  const a = object(x.assignment);
  const assignment: Assignment = {
    ...commonAssignment(a),
    pickups: list(a.pickups, parsePickup),
  };
  return { assignment };
}
export function parseRoute(v: unknown): Route | null {
  if (v === null) return null;
  const x = object(v);
  return {
    route_id: text(x.route_id),
    vehicle_id: text(x.vehicle_id),
    assignment_id: text(x.assignment_id),
    revision_id: text(x.revision_id),
    status: text(x.status),
    tasks: list(x.tasks, (value) => {
      const t = object(value);
      const task: RouteTask = {
        task_id: text(t.task_id),
        pickup_execution_id: nullableText(t.pickup_execution_id),
        kind: text(t.kind),
        state: text(t.state),
        committed_at: nullableDate(t.committed_at),
        receiving_point_id: nullableText(t.receiving_point_id),
        planned_start: date(t.planned_start),
        planned_end: date(t.planned_end),
      };
      return task;
    }),
  };
}
