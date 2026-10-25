import * as dto from './contracts';
import { list, uuid, type Decoder } from './schema';

export interface ReadSpec<T> {
  path: string;
  parse: Decoder<T>;
  scope: string;
}
function spec<T>(
  path: string,
  parse: Decoder<T>,
  scope: string,
  query: Record<string, string | number | undefined> = {},
): ReadSpec<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  const serialized = params.toString();
  return { path: path + (serialized ? '?' + serialized : ''), parse, scope };
}
const id = (value: string) => uuid(value.trim());
const cursor = (value?: string) =>
  value === undefined ? undefined : id(value);
export const reads = {
  regions: (after?: string) =>
    spec(
      '/v1/manager/business/operating_region',
      dto.regions,
      'Configuration identity index · 50 in region ID order; latest recorded revision is not operational capacity authority.',
      { limit: 50, after_id: cursor(after) },
    ),
  lineage: (requestId: string, after?: string) =>
    spec(
      `/v1/manager/business/bookings/${id(requestId)}/lineage`,
      dto.bookingLineage,
      'Known booking · 50 assignment history records in assignment ID order; no source field or global assignment list.',
      { limit: 50, after_id: cursor(after) },
    ),
  transfers: (requestId: string, after?: string) =>
    spec(
      `/v1/manager/business/bookings/${id(requestId)}/events/transfers`,
      dto.custodyTransfers,
      'Known booking · immutable custody transfer facts, 50 in transfer ID order. Not receiving-point handover validation.',
      { limit: 50, after_id: cursor(after) },
    ),
  riders: () =>
    spec(
      '/v1/manager/riders',
      list(dto.rider, 200),
      'Global · first 100 riders in ID order; no cursor or total.',
      { limit: 100 },
    ),
  groups: () =>
    spec(
      '/v1/manager/collection-groups/pending-assignment',
      list(dto.group, 200),
      'Global · first 100 pending groups in slot/ID order; no cursor or total.',
      { limit: 100 },
    ),
  incidents: () =>
    spec(
      '/v1/manager/incidents',
      list(dto.incident, 200),
      'Global · first 100 OPEN incidents in opened-time/ID order; no cursor or total.',
      { limit: 100 },
    ),
  route: (routeId: string) =>
    spec(
      `/v2/manager/routes/${id(routeId)}`,
      dto.route,
      'Current revision only · tasks retain backend ordinal order.',
    ),
  recovery: (riderId: string) =>
    spec(
      `/v2/manager/riders/${id(riderId)}/recovery-state`,
      dto.recoveryState,
      'Selected rider · non-closed routes and open failure references.',
    ),
  failure: (incidentId: string, after?: string, assignmentsAfter?: string) =>
    spec(
      `/v2/manager/rider-failures/${id(incidentId)}`,
      dto.failureDetail,
      'Selected failure · two independently paginated lists, 50 each.',
      {
        limit: 50,
        after_id: cursor(after),
        after_assignment_id: cursor(assignmentsAfter),
      },
    ),
  replacements: (after?: string) =>
    spec(
      '/v2/manager/replacements',
      dto.replacements,
      'Global · 50 replacements in ID order; not a failure-incident aggregate.',
      { limit: 50, after_id: cursor(after) },
    ),
  replacement: (replacementId: string, afterRank?: number) => {
    if (
      afterRank !== undefined &&
      (!Number.isSafeInteger(afterRank) || afterRank < 0)
    )
      throw new Error('Invalid candidate cursor.');
    return spec(
      `/v2/manager/replacements/${id(replacementId)}`,
      dto.replacementDetail,
      'Selected replacement · 50 candidates in backend rank order.',
      { limit: 50, after_rank: afterRank },
    );
  },
  evaluations: (replacementId: string, after?: string) =>
    spec(
      `/v2/manager/replacements/${id(replacementId)}/evaluations`,
      dto.evaluations,
      'Immutable evaluation history · 50 in ID order; may include incident siblings.',
      { limit: 50, after_id: cursor(after) },
    ),
  capacity: (regionId: string, after?: string) =>
    spec(
      `/v2/manager/regions/${id(regionId)}/capacity`,
      dto.capacity,
      'Selected region · first/next 100 vehicle memberships, not certified free capacity.',
      { limit: 100, after_vehicle_id: cursor(after) },
    ),
  backlog: (after?: string) =>
    spec(
      '/v2/manager/fleet/backlog',
      dto.backlog,
      'Global backlog · 50 unowned requests in ID order; no region filter or total.',
      { limit: 50, after_request_id: cursor(after) },
    ),
  fleet: () =>
    spec(
      '/v2/manager/fleet/status',
      dto.fleetStatus,
      'Global control · latest 50 cycles / 100 exceptions; no total or geographic filter.',
    ),
};

// Reads and mutations have separate allowlists; neither exposes arbitrary paths.
export function isManagerRead(path: string): boolean {
  const [base] = path.split('?');
  const guid = '[0-9a-fA-F-]{36}';
  return (
    new RegExp(
      `^/v1/manager/business/(operating_region|bookings/${guid}/(?:lineage|events/transfers))$`,
    ).test(base) ||
    /^\/v1\/manager\/(riders|incidents|collection-groups\/pending-assignment)$/.test(
      base,
    ) ||
    new RegExp(
      `^/v2/manager/(routes/${guid}|riders/${guid}/recovery-state|rider-failures/${guid}|replacements(?:/${guid}(?:/evaluations)?)?|regions/${guid}/capacity|fleet/(?:backlog|status))$`,
    ).test(base)
  );
}
