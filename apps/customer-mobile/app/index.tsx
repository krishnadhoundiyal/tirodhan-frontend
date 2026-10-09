import { useSyncExternalStore } from 'react';
import { Redirect } from 'expo-router';
import { previewCatalogue, session } from '../src/lib/runtime';
export default function Index() {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return (
    <Redirect
      href={
        state.status === 'authenticated' || previewCatalogue
          ? '/(product)/(tabs)'
          : '/login'
      }
    />
  );
}
