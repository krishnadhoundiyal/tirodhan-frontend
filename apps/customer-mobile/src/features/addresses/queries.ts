import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { repositories } from '../../lib/repositories';
import { session, previewCatalogue } from '../../lib/runtime';
export function useAddresses() {
  const { userId, status } = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  return useQuery({
    queryKey: ['addresses', userId],
    queryFn: ({ signal }) => repositories.addresses(signal),
    enabled: previewCatalogue || status === 'authenticated',
  });
}
