import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { repositories } from '../../lib/repositories';
import {
  navigationSession as session,
  navigationOwner,
} from '../../lib/navigation';
import { catalogueFreshness } from './catalogue';
import { isExpiredCursor } from '../../api/errors';
export function useCustomerOwner() {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return navigationOwner(state);
}
export function useCatalogue() {
  return useQuery({
    queryKey: ['catalogue'],
    queryFn: ({ signal }) => repositories.catalogue(signal),
    staleTime: (query) => catalogueFreshness(query.state.data),
    refetchInterval: (query) => {
      const remaining = catalogueFreshness(query.state.data);
      return remaining > 0 && remaining < 300000 ? remaining : false;
    },
  });
}
export function useRecommendations() {
  const owner = useCustomerOwner();
  return useQuery({
    queryKey: ['recommendations', owner],
    queryFn: ({ signal }) => repositories.recommendations(signal),
  });
}
export function useCollections(view: 'active' | 'history') {
  const owner = useCustomerOwner();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ['collections', owner, view],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      repositories.collections(view, pageParam, signal),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  useEffect(() => {
    if (query.isFetchNextPageError && isExpiredCursor(query.error))
      void queryClient.resetQueries({
        queryKey: ['collections', owner, view],
        exact: true,
      });
  }, [queryClient, query.error, query.isFetchNextPageError, owner, view]);
  return query;
}
export function useCollectionDetail(id: string) {
  const owner = useCustomerOwner();
  return useQuery({
    queryKey: ['collection', owner, id],
    queryFn: ({ signal }) => repositories.detail(id, signal),
    enabled: !!id,
  });
}
