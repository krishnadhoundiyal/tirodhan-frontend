import { riderAdmission } from '../session/admission';
import type { SessionSnapshot } from '../session/store';
import type { InstallationStore, NativePush, PushApi } from './contracts';
import { createSignalSync } from './synchronization';
type Context = {
  state: SessionSnapshot;
  identity: unknown;
  api: PushApi;
  refresh(): Promise<unknown>;
};
export type PushStatus =
  | 'unavailable'
  | 'idle'
  | 'permission'
  | 'denied'
  | 'registered'
  | 'retry'
  | 'revoking';
export function createPushLifecycle(deps: {
  context(): Context;
  active(): boolean;
  native(): NativePush | null;
  store: InstallationStore;
}) {
  let status: PushStatus = 'idle',
    listeners = new Set<() => void>(),
    queue: Promise<unknown> = Promise.resolve();
  let cleanup: (() => void) | null = null,
    listenerKey: unknown = null;
  let registered: { owner: string; identity: unknown; token: string } | null =
    null;
  let flight: Promise<void> | null = null,
    pending = false,
    prompt = false,
    force = false,
    stopped = false;
  const publish = (next: PushStatus) => {
    if (status !== next) {
      status = next;
      listeners.forEach((f) => f());
    }
  };
  const serial = <T>(work: () => Promise<T>) => {
    const task = queue.catch(() => {}).then(work);
    queue = task;
    return task;
  };
  const admitted = (c: Context) =>
    !!c.state.userId &&
    c.state.principal?.userId === c.state.userId &&
    c.state.status === 'authenticated' &&
    riderAdmission(c.state) === 'admitted';
  const current = (c: Context) => {
    const now = deps.context();
    return (
      !stopped &&
      deps.active() &&
      admitted(now) &&
      now.state.userId === c.state.userId &&
      now.identity === c.identity
    );
  };
  const dispose = () => {
    cleanup?.();
    cleanup = null;
    listenerKey = null;
  };
  async function reset(port: NativePush) {
    const record = await deps.store.load();
    await deps.store.save({ ...record, reset: true });
    await port.reset();
    registered = null;
    await deps.store.save({ ...record, owner: null, reset: false });
  }
  const reconcile = (request = false, renew = false): Promise<void> => {
    pending = true;
    prompt ||= request;
    force ||= renew;
    if (flight) return flight;
    const task = serial(async () => {
      while (pending) {
        const ask = prompt,
          again = force;
        pending = prompt = force = false;
        const c = deps.context();
        if (!current(c)) continue;
        try {
          const port = deps.native();
          if (!port) {
            publish('unavailable');
            return;
          }
          let record = await deps.store.load();
          if (!current(c)) continue;
          if (
            record.reset ||
            (record.owner && record.owner !== c.state.userId)
          ) {
            await reset(port);
            record = await deps.store.load();
          }
          if (!current(c)) continue;
          const permission = await port.permission(ask);
          if (!current(c)) continue;
          if (permission !== 'granted') {
            if (record.owner) await reset(port);
            if (current(c))
              publish(permission === 'denied' ? 'denied' : 'permission');
            continue;
          }
          if (listenerKey !== c.identity || !cleanup) {
            dispose();
            const sync = createSignalSync(c.refresh, () => current(c));
            const unsub: (() => void)[] = [];
            cleanup = () => unsub.forEach((f) => f());
            try {
              unsub.push(
                port.received((data) => {
                  void sync.signal(data);
                }),
              );
              unsub.push(
                port.opened((data) => {
                  void sync.signal(data);
                }),
              );
              unsub.push(
                port.tokenChanged(() => {
                  if (current(c)) void reconcile();
                }),
              );
            } catch (error) {
              dispose();
              throw error;
            }
            listenerKey = c.identity;
            void port
              .initial()
              .then((data) => sync.signal(data))
              .catch(() => {});
          }
          // SDK token creation is an ownership side effect too, even before the POST.
          await deps.store.save({
            ...record,
            owner: c.state.userId,
            reset: false,
          });
          if (!current(c)) continue;
          const token = await port.token();
          if (!current(c)) continue;
          if (
            !token ||
            token.length > 4096 ||
            /^(ExponentPushToken|ExpoPushToken)\[/.test(token)
          )
            throw new Error();
          if (
            again ||
            registered?.owner !== c.state.userId ||
            registered.identity !== c.identity ||
            registered.token !== token
          ) {
            // Bind before POST: a lost response still forces invalidation before another account.
            await deps.store.save({
              ...record,
              owner: c.state.userId,
              reset: false,
            });
            if (!current(c)) continue;
            await c.api.register(record.id, port.platform, token);
            if (!current(c)) continue;
            registered = {
              owner: c.state.userId!,
              identity: c.identity,
              token,
            };
          }
          publish('registered');
        } catch {
          if (current(c)) publish('retry');
        }
      }
    });
    flight = task;
    const release = () => {
      if (flight === task) {
        flight = null;
        if (pending) void reconcile();
      }
    };
    void task.then(release, release);
    return task;
  };
  const revoke = (c: Context) => {
    stopped = true;
    pending = prompt = force = false;
    dispose();
    registered = null;
    publish('revoking');
    return serial(async () => {
      try {
        const record = await deps.store.load();
        if (!record.owner && !record.reset) {
          publish('idle');
          return;
        }
        const port = deps.native();
        if (!port) {
          publish('unavailable');
          return;
        }
        await deps.store.save({ ...record, reset: true });
        // Never revoke through a newly established account's credentials.
        const now = deps.context();
        if (
          admitted(now) &&
          now.identity === c.identity &&
          now.state.userId === record.owner
        ) {
          try {
            await c.api.revoke(record.id);
          } catch {
            /* Persisted reset obligation survives offline logout. */
          }
        }
        await reset(port);
        publish('idle');
      } catch {
        publish('retry');
      }
    });
  };
  return {
    subscribe: (f: () => void) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    getSnapshot: () => status,
    reconcile: (request = false, renew = false) => {
      stopped = false;
      return reconcile(request, renew);
    },
    changed() {
      const c = deps.context();
      if (admitted(c)) {
        stopped = false;
        if (deps.active()) void reconcile();
      } else {
        dispose();
        registered = null;
        if (
          c.state.status === 'signedOut' ||
          (c.state.principalState === 'available' && !admitted(c))
        )
          void revoke(c);
      }
    },
    foreground: async () => {
      const c = deps.context();
      if (!admitted(c) || !deps.active()) return;
      stopped = false;
      await Promise.allSettled([c.refresh(), reconcile(false, true)]);
    },
    logout: () => revoke(deps.context()),
    suspend: dispose,
  };
}
export type PushLifecycle = ReturnType<typeof createPushLifecycle>;
