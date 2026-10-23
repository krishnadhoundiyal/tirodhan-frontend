export const executionMessages = {
  ROUTE_REVISION_STALE:
    'The route revision changed. Refresh and review it; recovery will keep the original command revision.',
  TASK_NOT_NEXT:
    'This is not the next executable task. Refresh the ordered route.',
  ACTIVE_SHIFT_REQUIRED:
    'An active backend-authorized shift is required. Contact operations.',
  FRESH_POSITION_REQUIRED:
    'Fresh authenticated vehicle position is required. This build cannot discover the shift needed to submit telemetry; contact operations.',
  RIDER_ON_BREAK: 'Execution is paused during the current operating break.',
  BOOKING_CANCELLED:
    'This booking was cancelled. No pickup completion was recorded by this rejected command.',
  PHYSICAL_TRANSFER_IN_PROGRESS:
    'A physical cargo transfer is pending. Follow the server-managed recovery process.',
  VEHICLE_OPERATION_BLOCKED:
    'This vehicle is blocked for collection. Contact operations.',
  ROUTE_RECEIPT_REQUIRED:
    'Confirm receipt of the current route before progressing.',
  ROUTE_NOT_EXECUTABLE:
    'Route execution is paused or closed. Refresh and contact operations.',
  OWNERSHIP_CHANGED: 'Pickup ownership changed. Do not retarget this command.',
  PICKUP_WINDOW_OR_BOOKING_INVALID:
    'The pickup window or booking state does not permit starting this task.',
  PICKUP_NOT_STARTED:
    'The next assigned pickup must be started before recording its outcome.',
  UNSUCCESSFUL_ATTEMPT_EVIDENCE_REQUIRED:
    'This unsuccessful attempt requires real evidence capture, reserved for RM-P0-03.',
  PHYSICAL_CAPACITY_EXCEEDED:
    'The vehicle does not have the required physical capacity. Contact operations.',
  COMMAND_IN_PROGRESS:
    'The original command is still being processed. Refresh before an explicit identical replay.',
  COMMAND_CONFLICT:
    'The command conflicts with recorded work. Review current state and the original recovery command.',
  RETRYABLE_TRANSACTION_CONFLICT:
    'A concurrent change won. Refresh before replaying the identical command.',
} as const;
export type ExecutionCode = keyof typeof executionMessages;
export function executionCode(value: unknown): ExecutionCode | undefined {
  if (!value || typeof value !== 'object' || !('detail' in value))
    return undefined;
  return Object.keys(executionMessages).find((key) => key === value.detail) as
    ExecutionCode | undefined;
}
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly kind:
      | 'http'
      | 'network'
      | 'timeout'
      | 'cancelled'
      | 'configuration'
      | 'protocol'
      | 'backendPending'
      | 'preview' = 'http',
    public readonly code?: ExecutionCode,
  ) {
    super(kind === 'http' ? `Request failed (${status})` : `Request ${kind}`);
    this.name = 'ApiError';
  }
}
export function userMessage(error: unknown): string {
  if (!(error instanceof ApiError))
    return 'Something went wrong. Please refresh and try again.';
  if (error.code) return executionMessages[error.code];
  if (error.kind === 'configuration')
    return 'The Rider service is not configured for this installation.';
  if (error.kind === 'protocol')
    return 'The service response could not be read. Refresh before trying again.';
  if (error.kind === 'network' || error.kind === 'timeout')
    return 'Unable to connect. The result may be unknown. Refresh before retrying.';
  if (error.status === 401) return 'Please sign in again.';
  if (error.status === 403)
    return 'Your account is not authorized for this action. Rider access has been rechecked.';
  if (error.status === 404)
    return 'This offer or Rider record is no longer available. Refresh to check current work.';
  if (error.status === 409)
    return 'This work changed, expired or was accepted elsewhere. Current state has been refreshed; review it before acting again.';
  if (error.status === 422) return 'Check the details you entered.';
  if (error.status === 429)
    return 'Too many attempts. Please wait before trying again.';
  if (error.kind === 'preview')
    return 'This is a development fixture. No live request was sent.';
  return 'The Rider service is temporarily unavailable. Please refresh.';
}
