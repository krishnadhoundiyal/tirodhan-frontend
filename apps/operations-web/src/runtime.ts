import { QueryClient } from '@tanstack/react-query';
import { ManagerSession, unavailableAdapter } from './auth/session';

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
  return {
    kind,
    session,
    queries,
    capabilities,
    dispose() {
      unsubscribe();
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
