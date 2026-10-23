import { riderSignal } from './signals';
export function createSignalSync(
  refresh: () => Promise<unknown>,
  current: () => boolean,
) {
  const seen = new Set<string>();
  let pending = false,
    flight: Promise<void> | null = null;
  const run = () => {
    pending = true;
    if (flight) return flight;
    const task = (async () => {
      while (pending && current()) {
        pending = false;
        await refresh();
      }
    })()
      .catch(() => {})
      .finally(() => {
        if (flight === task) flight = null;
      });
    flight = task;
    return task;
  };
  return {
    signal(data: unknown) {
      if (!current() || !riderSignal(data)) return Promise.resolve();
      const d = data as Record<string, string>,
        id =
          d.type === 'ASSIGNMENT_OFFER'
            ? [d.type, d.collection_group_id, d.offer_round]
            : [d.type, d.revision_id];
      if (id.some((x) => !x || x.length > 200)) return Promise.resolve();
      const fingerprint = JSON.stringify(id);
      if (seen.has(fingerprint)) return flight ?? Promise.resolve();
      seen.add(fingerprint);
      if (seen.size > 128) seen.delete(seen.values().next().value!);
      return run();
    },
    foreground: run,
  };
}
