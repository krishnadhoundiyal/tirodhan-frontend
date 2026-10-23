import type { Assignment, Availability, Route } from '../../api/contracts';
export const incidentReasons = [
  'CUSTOMER_UNAVAILABLE',
  'ADDRESS_NOT_FOUND',
  'ACCESS_BLOCKED',
  'RIDER_UNABLE_TO_REACH',
  'RIDER_UNABLE_TO_CONTINUE',
  'OTHER',
] as const;
export type IncidentReason = (typeof incidentReasons)[number];
export const vehicleReasons = [
  'BREAKDOWN',
  'LOAD_UNCERTAIN',
  'DISCHARGE_DELAY',
  'SAFETY',
] as const;
export type VehicleReason = (typeof vehicleReasons)[number];
export type Context = {
  assignmentId: string;
  source: string;
  routeId?: string;
  revisionId?: string;
};
export type Action = Context &
  (
    | { kind: 'V1_START' }
    | {
        kind: 'V1_ATTEMPT';
        pickupId: string;
        outcome: 'COLLECTED' | 'NOT_COLLECTED';
      }
    | { kind: 'V1_INCIDENT'; pickupId: string; reason: IncidentReason }
    | {
        kind: 'V2_TASK';
        taskId: string;
        operation: 'START' | 'DEPART' | 'PICKUP';
        outcome?: 'COLLECTED';
      }
    | { kind: 'V2_ACK' }
    | { kind: 'V2_ISSUE'; reason: VehicleReason }
  );
export type Command = Action & { id: string };
export type Receipt = { resourceId: string; message: string };
export type RecordState = {
  version: 1;
  owner: string;
  command: Command;
  status: 'prepared' | 'confirmed' | 'rejected';
  receipt: Receipt | null;
  rejection: number | null;
};
export type ExecutionState = {
  assignment: Assignment | null;
  availability: Availability;
  route: Route | null;
};
export function authority(state: ExecutionState) {
  const a = state.assignment,
    r = state.route;
  if (!a || a.status !== 'ACTIVE' || a.completed_at !== null)
    return 'UNAVAILABLE' as const;
  if (a.source === 'COMMITTED_DISPATCH')
    return r && r.assignment_id === a.assignment_id
      ? ('V2' as const)
      : ('UNAVAILABLE' as const);
  if (
    ['RIDER_OFFER_ACCEPTED', 'MANAGER_ASSIGNED'].includes(a.source) &&
    r === null
  )
    return 'V1' as const;
  return 'UNAVAILABLE' as const;
}
export function nextTask(route: Route) {
  if (
    route.tasks.some(
      (task) =>
        !['PENDING', 'STARTED', 'COMPLETED', 'CANCELLED'].includes(
          task.state,
        ) || !['PICKUP', 'DISCHARGE'].includes(task.kind),
    )
  )
    return undefined;
  return route.tasks.find(
    (task) => task.state === 'PENDING' || task.state === 'STARTED',
  );
}
