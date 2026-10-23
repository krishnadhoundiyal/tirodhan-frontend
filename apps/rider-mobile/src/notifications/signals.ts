// Verified FCM data payloads are refresh hints only, never assignments or route authority.
export function riderSignal(data: unknown): 'offers' | 'route' | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = data as Record<string, unknown>;
  if (
    value.type === 'ASSIGNMENT_OFFER' &&
    typeof value.collection_group_id === 'string' &&
    value.collection_group_id.length > 0 &&
    typeof value.offer_round === 'string' &&
    /^[1-9]\d*$/.test(value.offer_round)
  )
    return 'offers';
  if (
    value.type === 'ROUTE_REVISION' &&
    typeof value.revision_id === 'string' &&
    value.revision_id
  )
    return 'route';
  return null;
}
export const pushRegistrationStatus = {
  enabled: false,
  message:
    'Assignment notifications are not configured for this Rider build. Refresh on return or use Refresh. Operational notification acceptance is pending native FCM setup.',
} as const;
