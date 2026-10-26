import { QueryClient } from '@tanstack/react-query';
import { CustomerSession, unavailableAdapter } from './auth/session';
import { CustomerApi } from './api/customer';
import type { ReactNode } from 'react';
import {
  CustomerExperience,
  type ExperienceOptions,
} from './features/customer-model';
export interface DevelopmentTools {
  financialControls?: ReactNode;
  banner: ReactNode;
  controls: ReactNode;
  signInLabel: string;
  signIn: () => Promise<void>;
}
export function createRuntime(
  session: CustomerSession,
  options: ExperienceOptions = {},
) {
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
  let experience: CustomerExperience | null = null;
  const retired = new Set<CustomerExperience>();
  session.beforeLogout(async () => {
    if (experience) retired.add(experience);
    const results = await Promise.allSettled(
      [...retired].map(async (x) => {
        await x.dispose(true);
        retired.delete(x);
      }),
    );
    if (results.some((r) => r.status === 'rejected'))
      throw new Error('Local customer cleanup pending');
  });
  session.subscribe(() => {
    const next = session.snapshot().epoch;
    if (next !== epoch) {
      if (experience) {
        retired.add(experience);
        if (session.snapshot().invalidation === 'logout')
          experience.invalidate();
        else void experience.dispose(false).catch(() => {});
        experience = null;
      }
      epoch = next;
      void client.cancelQueries();
      client.clear();
    }
  });
  return {
    session,
    api: new CustomerApi(session),
    client,
    customer: () => {
      if (!experience) {
        const owner = session.snapshot().principal?.user_id;
        for (const old of retired)
          if (old.owner !== owner) {
            void old
              .dispose(true)
              .then(() => retired.delete(old))
              .catch(() => {});
          }
        experience = new CustomerExperience(session, options);
      }
      return experience;
    },
    development: undefined as DevelopmentTools | undefined,
  };
}
export type Runtime = ReturnType<typeof createRuntime>;
export const productionRuntime = () =>
  createRuntime(new CustomerSession(unavailableAdapter, null, fetch));
