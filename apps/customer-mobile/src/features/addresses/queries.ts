import { useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api } from '../../api';
import { session } from '../../lib/runtime';
export function useAddresses() {
  const { userId, status } = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  return useQuery({
    queryKey: ['addresses', userId],
    queryFn: ({ signal }) => api.addresses(signal),
    enabled: status === 'authenticated',
  });
}
