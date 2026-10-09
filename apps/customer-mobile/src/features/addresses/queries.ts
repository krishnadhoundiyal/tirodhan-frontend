import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { repositories } from '../../lib/repositories';
import { previewCatalogue } from '../../lib/runtime';
import {
  navigationSession as session,
  navigationOwner,
} from '../../lib/navigation';
export function useAddresses() {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return useQuery({
    queryKey: ['addresses', navigationOwner(state)],
    queryFn: ({ signal }) => repositories.addresses(signal),
    enabled: previewCatalogue || state.status === 'authenticated',
  });
}
