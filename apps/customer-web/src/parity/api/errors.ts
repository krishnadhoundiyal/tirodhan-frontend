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
    public readonly code?: SafeErrorCode,
  ) {
    super(kind === 'http' ? `Request failed (${status})` : `Request ${kind}`);
    this.name = 'ApiError';
  }
}
export const safeErrorCodes = [
  'PLANNING_CUTOFF_REACHED',
  'PLANNING_STARTED',
  'SERVICEABILITY_EXPIRED',
  'SERVICEABILITY_UNSERVICEABLE',
  'SLOT_UNAVAILABLE',
  'VERSION_CONFLICT',
  'NOT_ELIGIBLE',
  'CURSOR_EXPIRED',
  'WEIGHT_POLICY_CHANGED_REVIEW_DECLARATIONS',
  'QUOTE_CONFIRMATION_STALE_OR_MISMATCHED',
  'ITEM_VOLUME_DECLARATIONS_REQUIRED',
  'NUMERICAL_WEIGHT_MUST_EXCEED_T',
  'WEIGHT_BAND_REQUIRED',
  'DECLARED_WEIGHT_MISMATCH',
  'AGGREGATE_WEIGHT_OUT_OF_RANGE',
  'AGGREGATE_VOLUME_OUT_OF_RANGE',
] as const;
export type SafeErrorCode = (typeof safeErrorCodes)[number];
// Writes may have committed before any of these responses reached the client.
export function ambiguousCommand(error: unknown) {
  return (
    !(error instanceof ApiError) ||
    ['network', 'timeout', 'protocol', 'cancelled'].includes(error.kind) ||
    error.status >= 500 ||
    error.status === 408
  );
}
export function isExpiredCursor(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === 'CURSOR_EXPIRED'
  );
}
export function safeErrorCode(body: unknown): SafeErrorCode | undefined {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = body.detail;
    // Current weight endpoints expose controlled codes in detail; exact allowlist only.
    const code =
      typeof detail === 'string'
        ? detail
        : detail && typeof detail === 'object' && 'code' in detail
          ? detail.code
          : undefined;
    const legacyString =
      typeof detail === 'string' &&
      [
        'PLANNING_CUTOFF_REACHED',
        'PLANNING_STARTED',
        'SERVICEABILITY_EXPIRED',
        'SERVICEABILITY_UNSERVICEABLE',
        'SLOT_UNAVAILABLE',
        'VERSION_CONFLICT',
        'NOT_ELIGIBLE',
        'CURSOR_EXPIRED',
      ].includes(detail);
    const known = legacyString
      ? undefined
      : safeErrorCodes.find((value) => value === code);
    if (known) return known;
  }
  if (!body || typeof body !== 'object' || !('error' in body)) return undefined;
  const error = body.error;
  if (!error || typeof error !== 'object' || !('code' in error))
    return undefined;
  return safeErrorCodes.find((code) => code === error.code);
}
export function userMessage(error: unknown): string {
  if (!(error instanceof ApiError))
    return 'Something went wrong. Please try again.';
  if (
    error.code === 'WEIGHT_POLICY_CHANGED_REVIEW_DECLARATIONS' ||
    error.code === 'QUOTE_CONFIRMATION_STALE_OR_MISMATCHED'
  )
    return 'Pricing has changed. Review the current weight bands and pickup price again.';
  if (error.code === 'ITEM_VOLUME_DECLARATIONS_REQUIRED')
    return 'Enter the occupied volume for every selected item.';
  if (error.kind === 'backendPending')
    return 'This feature is waiting for Tirodhan’s service connection. Please try again later.';
  if (error.kind === 'preview')
    return 'This is a development preview. No request was sent to Tirodhan.';
  if (error.kind === 'protocol')
    return 'We couldn’t read the service response. Please try again.';
  if (
    error.code === 'PLANNING_CUTOFF_REACHED' ||
    error.code === 'PLANNING_STARTED'
  )
    return 'This pickup can no longer be cancelled because planning has already started.';
  if (error.code === 'SERVICEABILITY_EXPIRED')
    return 'Pickup availability has expired. Please check the address again.';
  if (error.code === 'SERVICEABILITY_UNSERVICEABLE')
    return 'Pickup is not currently available at this address.';
  if (error.code === 'SLOT_UNAVAILABLE')
    return 'This pickup time is no longer available. Please choose another time.';
  if (error.kind === 'configuration')
    return 'The service is not configured yet.';
  if (error.kind === 'network' || error.kind === 'timeout')
    return 'Unable to connect. Check your connection and try again.';
  if (error.status === 401) return 'Please sign in again.';
  if (error.status === 403)
    return 'This action is not available for your account.';
  if (error.status === 404)
    return 'This collection or saved detail is no longer available.';
  if (error.status === 409)
    return 'These details have changed. Refresh and try again.';
  if (error.status === 422) return 'Please check the details you entered.';
  if (error.status === 429) return 'Please wait a little before trying again.';
  return 'The service is temporarily unavailable. Please try again.';
}
