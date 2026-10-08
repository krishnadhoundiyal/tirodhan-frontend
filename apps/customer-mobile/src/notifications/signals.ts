export interface NotificationSignal {
  identifier: string;
  data: unknown;
}
// Customer payload schema is absent. Arbitrary URLs/routes/business fields are never consumed.
export interface CustomerNotificationContract {
  destination(data: unknown): '/activity' | null;
}
const pendingContract: CustomerNotificationContract = {
  destination: () => null,
};
export function notificationDispatcher(
  refetch: () => void,
  navigate: (route: '/activity') => void,
  contract = pendingContract,
) {
  const tapped = new Map<string, number>();
  return {
    foreground(_signal: NotificationSignal) {
      refetch();
    },
    tap(signal: NotificationSignal) {
      refetch(); // Includes duplicates and stale signals; API remains business truth.
      const now = Date.now();
      for (const [key, time] of tapped)
        if (now - time > 600000) tapped.delete(key);
      if (tapped.has(signal.identifier)) return;
      if (tapped.size >= 100) tapped.delete(tapped.keys().next().value!);
      tapped.set(signal.identifier, now);
      navigate(contract.destination(signal.data) ?? '/activity');
    },
    reset() {
      tapped.clear();
    },
  };
}
