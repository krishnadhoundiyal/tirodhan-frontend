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
  ) {
    super(kind === 'http' ? `Request failed (${status})` : `Request ${kind}`);
    this.name = 'ApiError';
  }
}
export function userMessage(error: unknown): string {
  if (!(error instanceof ApiError))
    return 'Something went wrong. Please refresh and try again.';
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
