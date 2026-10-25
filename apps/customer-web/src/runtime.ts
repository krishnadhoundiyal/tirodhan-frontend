import { QueryClient } from '@tanstack/react-query';
import { CustomerSession, unavailableAdapter } from './auth/session';
import { CustomerApi } from './api/customer';
import type { ReactNode } from 'react';
export interface DevelopmentTools {
  banner: ReactNode;
  controls: ReactNode;
  signInLabel: string;
  signIn: () => Promise<void>;
}
export function createRuntime(session: CustomerSession) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        networkMode: 'always',
      },
      mutations: { retry: false, networkMode: 'always' },
    },
  });
  let epoch = session.snapshot().epoch;
  session.subscribe(() => {
    const next = session.snapshot().epoch;
    if (next !== epoch) {
      epoch = next;
      void client.cancelQueries();
      client.clear();
    }
  });
  return {
    session,
    api: new CustomerApi(session),
    client,
    development: undefined as DevelopmentTools | undefined,
  };
}
export type Runtime = ReturnType<typeof createRuntime>;
export const productionRuntime = () =>
  createRuntime(new CustomerSession(unavailableAdapter, null, fetch));
