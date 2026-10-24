import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { operationsForSession, session, queryClient } from './runtime';
import type { Resource, ResourceData } from './features/operations';
export const useSession = () =>
  useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
export function useRiderResource<K extends Resource>(resource: K) {
  const operations = operationsForSession();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  const query = useQuery<ResourceData[K]>({
    ...operations.query(resource),
    enabled: focused && active,
  });
  useEffect(() => {
    if (!focused || !active) void queryClientCancel(operations.key(resource));
  }, [focused, active, operations, resource]);
  return { query, operations };
}
const queryClientCancel = (key: unknown[]) =>
  queryClient.cancelQueries({ queryKey: key });
