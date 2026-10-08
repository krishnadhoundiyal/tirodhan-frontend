import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { repositories } from '../../lib/repositories';
import { session } from '../../lib/runtime';
import { catalogueFreshness } from './catalogue';
export function useCustomerOwner() {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return state.userId ?? 'development-preview';
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
  return useInfiniteQuery({
    queryKey: ['collections', owner, view],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      repositories.collections(view, pageParam, signal),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
}
export function useCollectionDetail(id: string) {
  const owner = useCustomerOwner();
  return useQuery({
    queryKey: ['collection', owner, id],
    queryFn: ({ signal }) => repositories.detail(id, signal),
    enabled: !!id,
  });
}
