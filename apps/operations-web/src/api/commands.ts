import { replacementDetail } from './contracts';
import {
  ContractError,
  integer,
  list,
  nullable,
  object,
  text,
  timestamp,
  uuid,
} from './schema';

export const assignmentSummary = object({
  assignment_id: uuid,
  collection_group_id: nullable(uuid),
  rider_id: uuid,
  source: text,
  status: text,
  assigned_at: timestamp,
  started_at: nullable(timestamp),
  completed_at: nullable(timestamp),
});
const resource = object({ resource_id: uuid });
export type CommandResult =
  | ReturnType<typeof assignmentSummary>
  | ReturnType<typeof resource>
  | ReturnType<typeof replacementDetail>;
export interface Command {
  readonly path: string;
  readonly payload: string;
  readonly expectedStatus: 200 | 202;
  readonly title: string;
  readonly target: string;
  readonly intent: string;
  readonly identity: string | null;
  readonly v2: boolean;
  readonly parse: (value: unknown) => CommandResult;
}
const issued = new WeakSet<Command>();
export const isCommand = (value: Command) => issued.has(value);
const positive = (value: unknown) => {
  const result = integer(value);
  if (result < 1) throw new ContractError();
  return result;
};
const reason = (value: unknown) => {
  const result = text(value);
  if (!/^[A-Z0-9_]{1,100}$/.test(result)) throw new ContractError();
  return result;
};
export function routeVersions(value: unknown): Record<string, number> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length > 1000
  )
    throw new ContractError();
  return Object.fromEntries(
    Object.entries(value).map(([key, version]) => [
      uuid(key),
      positive(version),
    ]),
  );
}
function make(
  path: string,
  body: Record<string, unknown>,
  title: string,
  target: string,
  parse: Command['parse'],
  accepted = false,
): Command {
  const identity = (body.client_command_id ??
    body.client_reassignment_id ??
    null) as string | null;
  const semantic = { ...body };
  delete semantic.client_command_id;
  delete semantic.client_reassignment_id;
  const result: Command = Object.freeze({
    path,
    payload: JSON.stringify(body),
    title,
    target,
    identity,
    intent: path + JSON.stringify(semantic),
    expectedStatus: accepted ? 202 : 200,
    v2: path.startsWith('/v2/'),
    parse,
  });
  issued.add(result);
  return result;
}
const failure = (
  body: Record<string, unknown>,
  title: string,
  target: string,
) => make('/v2/manager/rider-failures', body, title, target, resource, true);
export const commands = {
  assign(group: string, rider: string) {
    return make(
      `/v1/manager/collection-groups/${uuid(group)}/assign`,
      { rider_id: uuid(rider) },
      'Assign pending V1 group',
      group,
      assignmentSummary,
    );
  },
  reassign(
    predecessor: string,
    rider: string,
    identity: string = crypto.randomUUID(),
    incident?: string,
  ) {
    return make(
      `/v1/manager/assignments/${uuid(predecessor)}/reassign`,
      {
        client_reassignment_id: uuid(identity),
        replacement_rider_id: uuid(rider),
        ...(incident ? { incident_id: uuid(incident) } : {}),
      },
      'Reassign V1 outstanding work',
      predecessor,
      assignmentSummary,
    );
  },
  fail(
    rider: string,
    code: 'RIDER_UNAVAILABLE' | 'VEHICLE_UNAVAILABLE' | 'EXECUTION_EXCEPTION',
    versions: Record<string, number>,
    identity: string = crypto.randomUUID(),
  ) {
    if (
      ![
        'RIDER_UNAVAILABLE',
        'VEHICLE_UNAVAILABLE',
        'EXECUTION_EXCEPTION',
      ].includes(code)
    )
      throw new ContractError();
    return failure(
      {
        operation: 'FAIL_RIDER',
        client_command_id: uuid(identity),
        rider_id: uuid(rider),
        reason: code,
        expected_route_versions: routeVersions(versions),
      },
      'Declare rider failure',
      rider,
    );
  },
  approve(
    incident: string,
    version: number,
    candidate: string,
    replacements: string[],
    code: string,
    identity: string = crypto.randomUUID(),
  ) {
    if (
      !replacements.length ||
      new Set(replacements).size !== replacements.length
    )
      throw new ContractError();
    return failure(
      {
        operation: 'APPROVE_RECOVERY',
        client_command_id: uuid(identity),
        incident_id: uuid(incident),
        expected_version: positive(version),
        selections: [
          {
            candidate_id: uuid(candidate),
            replacement_ids: list(uuid, 100)(replacements),
          },
        ],
        reason: reason(code),
      },
      'Approve incident recovery allocation',
      incident,
    );
  },
  retry(
    assignment: string,
    version: number,
    newOptions: boolean,
    identity: string = crypto.randomUUID(),
  ) {
    if (typeof newOptions !== 'boolean') throw new ContractError();
    return failure(
      {
        operation: 'RETRY_RECOVERY',
        client_command_id: uuid(identity),
        assignment_id: uuid(assignment),
        expected_version: positive(version),
        request_new_options: newOptions,
      },
      newOptions ? 'Request new recovery options' : 'Retry recovery activation',
      assignment,
    );
  },
  resolve(
    replacement: string,
    version: number,
    confirmed: boolean,
    identity: string = crypto.randomUUID(),
  ) {
    if (confirmed !== true) throw new ContractError();
    return failure(
      {
        operation: 'RESOLVE_FAILED_PICKUP',
        client_command_id: uuid(identity),
        replacement_id: uuid(replacement),
        expected_version: positive(version),
        no_collection_confirmed: true,
      },
      'Resolve failed pickup service facts',
      replacement,
    );
  },
  select(
    replacement: string,
    candidate: string,
    version: number,
    source: number,
    region: number,
    versions: Record<string, number>,
    code: string,
    identity: string = crypto.randomUUID(),
  ) {
    return make(
      `/v2/manager/replacements/${uuid(replacement)}/select`,
      {
        client_command_id: uuid(identity),
        selected_candidate_id: uuid(candidate),
        expected_version: positive(version),
        expected_source_version: positive(source),
        expected_region_version: positive(region),
        expected_route_versions: routeVersions(versions),
        reason: reason(code),
      },
      'Select ordinary replacement candidate',
      replacement,
      replacementDetail,
    );
  },
};

export class CommandError extends Error {
  constructor(
    readonly kind: 'conflict' | 'rejected' | 'uncertain',
    readonly code: string | null = null,
  ) {
    super(
      kind === 'uncertain'
        ? 'The outcome is uncertain. Reconcile current state before retrying this exact command.'
        : kind === 'conflict'
          ? 'The backend reported a conflict. Refresh authoritative state and review the decision.'
          : 'The backend did not accept this command. Refresh current state before reviewing again.',
    );
  }
}
const conflicts = new Set([
  'COMMAND_CONFLICT',
  'COMMAND_IN_PROGRESS',
  'RETRYABLE_TRANSACTION_CONFLICT',
  'FAILURE_ROUTES_CHANGED',
  'SINGLE_REGIONAL_OWNER_REQUIRED',
  'EXISTING_APPROVAL_REQUIRES_REVIEW',
  'REPLACEMENT_OWNERSHIP_CHANGED',
  'FAILURE_INCIDENT_VERSION_CHANGED',
  'REPLACEMENT_CANDIDATE_STALE',
  'REPLACEMENT_COVERAGE_MISMATCH',
  'INCIDENT_OBLIGATION_MISMATCH',
  'RESOURCE_RECOVERY_PENDING',
  'ACTIVE_SHIFT_REQUIRED',
  'RECOVERY_ASSIGNMENT_CHANGED',
  'RESOLVE_PHYSICAL_TRANSFER_FIRST',
  'FAILURE_OBLIGATION_REQUIRED',
  'FAILED_SERVICE_FACTS_CHANGED',
  'USE_INCIDENT_RECOVERY_ALLOCATION',
  'REPLACEMENT_VERSION_CHANGED',
  'REPLACEMENT_RECOMMENDATION_STALE',
  'REPLACEMENT_ROUTE_VERSIONS_CHANGED',
]);
export function conflictCode(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('detail' in body)) return null;
  return typeof body.detail === 'string' && conflicts.has(body.detail)
    ? body.detail
    : null;
}
