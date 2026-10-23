import { ApiError } from './errors';
import { object, parseSummary } from './parse';
import type { Transport } from './transport';
import type { Command, Receipt } from '../features/execution/contracts';
const text = (v: unknown) => {
  if (typeof v !== 'string' || !v.trim()) throw new ApiError(200, 'protocol');
  return v;
};
export function commandRequest(c: Command): { path: string; body?: unknown } {
  switch (c.kind) {
    case 'V1_START':
      return {
        path: `/v1/rider/assignments/${encodeURIComponent(c.assignmentId)}/start`,
      };
    case 'V1_ATTEMPT':
      return {
        path: `/v1/rider/pickups/${encodeURIComponent(c.pickupId)}/attempts`,
        body: { client_attempt_id: c.id, outcome: c.outcome },
      };
    case 'V1_INCIDENT':
      return {
        path: `/v1/rider/pickups/${encodeURIComponent(c.pickupId)}/incidents`,
        body: { client_incident_id: c.id, reason_code: c.reason },
      };
    case 'V2_ACK':
      return {
        path: '/v2/rider/operations',
        body: {
          client_command_id: c.id,
          operation: 'ACKNOWLEDGE',
          revision_id: c.revisionId,
        },
      };
    case 'V2_ISSUE':
      return {
        path: '/v2/rider/vehicle-issue',
        body: {
          client_command_id: c.id,
          route_id: c.routeId,
          reason: c.reason,
        },
      };
    case 'V2_TASK':
      return {
        path: '/v2/rider/route-tasks',
        body: {
          client_command_id: c.id,
          task_id: c.taskId,
          revision_id: c.revisionId,
          operation: c.operation,
          ...(c.operation === 'PICKUP' ? { outcome: c.outcome } : {}),
        },
      };
  }
}
export function parseExecutionReceipt(
  c: Command,
  value: unknown,
  owner: string,
): Receipt {
  const v = object(value);
  const fail = (): never => {
    throw new ApiError(200, 'protocol');
  };
  if (c.kind === 'V1_START') {
    const a = parseSummary(v);
    if (
      a.assignment_id !== c.assignmentId ||
      a.rider_id !== owner ||
      !a.started_at ||
      !['ACTIVE', 'COMPLETED', 'SUPERSEDED'].includes(a.status)
    )
      fail();
    return {
      resourceId: a.assignment_id,
      message: `Assignment start acknowledged: ${a.status}. Current assigned work is refreshed separately.`,
    };
  }
  if (c.kind === 'V1_ATTEMPT' || c.kind === 'V1_INCIDENT') {
    if (
      v.pickup_execution_id !== c.pickupId ||
      v.rider_assignment_id !== c.assignmentId
    )
      fail();
    if (c.kind === 'V1_ATTEMPT') {
      if (
        v.client_attempt_id !== c.id ||
        v.outcome !== c.outcome ||
        !Number.isSafeInteger(v.attempt_number) ||
        Number(v.attempt_number) < 1 ||
        !Number.isFinite(Date.parse(text(v.attempted_at)))
      )
        fail();
      return {
        resourceId: text(v.pickup_attempt_id),
        message: `Backend recorded attempt: ${c.outcome}. ${c.outcome === 'NOT_COLLECTED' ? 'This does not complete the pickup or assignment.' : 'Review the refreshed pickup state.'}`,
      };
    }
    if (
      v.client_incident_id !== c.id ||
      v.reason_code !== c.reason ||
      !['OPEN', 'RESOLVED'].includes(text(v.status)) ||
      !Number.isFinite(Date.parse(text(v.opened_at)))
    )
      fail();
    return {
      resourceId: text(v.incident_id),
      message: `Incident recorded: ${text(v.status)}. This is not pickup completion or reassignment.`,
    };
  }
  const id = text(c.kind === 'V2_ISSUE' ? v.exception_id : v.resource_id);
  if (c.kind === 'V2_TASK' && c.operation !== 'PICKUP' && id !== c.taskId)
    fail();
  if (c.kind === 'V2_ACK' && id !== c.revisionId) fail();
  return {
    resourceId: id,
    message:
      c.kind === 'V2_ISSUE'
        ? 'Vehicle issue recorded. Recovery and custody remain server managed.'
        : c.kind === 'V2_ACK'
          ? 'Route receipt recorded. Receipt is not acceptance or permission to bypass execution guards.'
          : `Route command acknowledged: ${c.operation}. Review current task state below.`,
  };
}
export interface ExecutionApi {
  send(command: Command, owner: string): Promise<Receipt>;
}
export function createExecutionApi(transport: Transport): ExecutionApi {
  return {
    send: async (command, owner) => {
      const request = commandRequest(command);
      return parseExecutionReceipt(
        command,
        await transport.request(request.path, {
          method: 'POST',
          body: request.body,
        }),
        owner,
      );
    },
  };
}
