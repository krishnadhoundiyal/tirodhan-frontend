export interface NotificationSignal {
  identifier: string;
  data: unknown;
}
export type NotificationDestination =
  | '/activity'
  | { pathname: '/collections/[requestId]'; params: { requestId: string } };
export interface CustomerNotificationContract {
  destination(data: unknown): NotificationDestination | null;
}
export function collectionSignal(
  data: unknown,
): { eventId: string; requestId: string } | null {
  if (!data || typeof data !== 'object') return null;
  const payload = data as Record<string, unknown>;
  if (
    payload.schema_version !== 1 ||
    payload.target !== 'COLLECTION' ||
    typeof payload.event_id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(payload.event_id) ||
    typeof payload.request_id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      payload.request_id,
    )
  )
    return null;
  return { eventId: payload.event_id, requestId: payload.request_id };
}
const customerContract: CustomerNotificationContract = {
  destination(data) {
    const signal = collectionSignal(data);
    return signal
      ? {
          pathname: '/collections/[requestId]',
          params: { requestId: signal.requestId },
        }
      : null;
  },
};
export function notificationDispatcher(
  refetch: (requestId?: string) => void,
  navigate: (route: NotificationDestination) => void,
  contract = customerContract,
) {
  const tapped = new Map<string, number>();
  return {
    foreground(signal: NotificationSignal) {
      refetch(collectionSignal(signal.data)?.requestId);
    },
    tap(signal: NotificationSignal) {
      const payload = collectionSignal(signal.data);
      refetch(payload?.requestId);
      const now = Date.now();
      for (const [key, time] of tapped)
        if (now - time > 600000) tapped.delete(key);
      const key = payload?.eventId ?? signal.identifier;
      if (tapped.has(key)) return;
      if (tapped.size >= 100) tapped.delete(tapped.keys().next().value!);
      tapped.set(key, now);
      navigate(contract.destination(signal.data) ?? '/activity');
    },
    reset() {
      tapped.clear();
    },
  };
}
