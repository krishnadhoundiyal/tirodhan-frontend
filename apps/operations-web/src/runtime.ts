import { QueryClient } from '@tanstack/react-query';
import { ManagerSession, unavailableAdapter } from './auth/session';
import { CommandStore } from './command-store';

export interface Capabilities {
  dispatch: boolean;
  fleet: boolean;
  orchestration: boolean;
}
export interface Runtime {
  kind: 'unavailable' | 'fixture' | 'verified-adapter';
  session: ManagerSession;
  queries: QueryClient;
  capabilities: Capabilities;
  commands: CommandStore;
  preview?: {
    scenarios: readonly string[];
    current(): string;
    change(value: string): Promise<void>;
    routeId: string;
    references: Record<string, string>;
  };
  dispose(): void;
}
export function createRuntime(
  kind: Runtime['kind'],
  session: ManagerSession,
  capabilities: Capabilities,
): Runtime {
  const queries = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
        networkMode: 'always',
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
  let epoch = session.snapshot().epoch;
  const unsubscribe = session.subscribe(() => {
    if (epoch !== session.snapshot().epoch) {
      epoch = session.snapshot().epoch;
      void queries.cancelQueries();
      queries.clear();
    }
  });
  const commands = new CommandStore(
    session,
    (command) =>
      kind !== 'unavailable' &&
      (!command.v2 ||
        (capabilities.dispatch &&
          capabilities.fleet &&
          capabilities.orchestration)),
    (command, context) =>
      queries.invalidateQueries({
        queryKey: ['manager'],
        predicate: (query) => {
          const path = String(query.queryKey[2]);
          return (
            (command.path.includes('/reassign') &&
              path.startsWith('/v1/manager/incidents?')) ||
            path.startsWith('/v1/manager/riders?') ||
            path.startsWith(
              '/v1/manager/collection-groups/pending-assignment?',
            ) ||
            (!!context.booking &&
              path.includes(`/bookings/${context.booking}/lineage`)) ||
            (!!context.rider &&
              path.includes(`/riders/${context.rider}/recovery-state`)) ||
            (!!context.incident &&
              path.includes(`/rider-failures/${context.incident}`)) ||
            (!!context.replacement &&
              path.includes(`/replacements/${context.replacement}`)) ||
            (command.path.includes('/replacements/') &&
              path.startsWith(command.path.replace('/select', '')))
          );
        },
        refetchType: 'active',
      }),
  );
  return {
    kind,
    session,
    queries,
    capabilities,
    commands,
    dispose() {
      unsubscribe();
      commands.dispose();
      void queries.cancelQueries();
      queries.clear();
    },
  };
}
export function unavailableRuntime(
  origin: string | null,
  capabilities: Capabilities,
): Runtime {
  return createRuntime(
    'unavailable',
    new ManagerSession(unavailableAdapter, origin, fetch),
    capabilities,
  );
}
