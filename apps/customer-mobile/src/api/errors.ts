export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly kind:
      'http' | 'network' | 'timeout' | 'cancelled' | 'configuration' = 'http',
  ) {
    super(kind === 'http' ? `Request failed (${status})` : `Request ${kind}`);
    this.name = 'ApiError';
  }
}
export function userMessage(error: unknown): string {
  if (!(error instanceof ApiError))
    return 'Something went wrong. Please try again.';
  if (error.kind === 'configuration')
    return 'The service is not configured yet.';
  if (error.kind === 'network' || error.kind === 'timeout')
    return 'Unable to connect. Check your connection and try again.';
  if (error.status === 401) return 'Please sign in again.';
  if (error.status === 403)
    return 'This action is not available for your account.';
  if (error.status === 409)
    return 'These details have changed. Refresh and try again.';
  if (error.status === 422) return 'Please check the details you entered.';
  if (error.status === 429) return 'Please wait a little before trying again.';
  return 'The service is temporarily unavailable. Please try again.';
}
