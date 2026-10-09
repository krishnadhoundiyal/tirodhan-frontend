import { useSyncExternalStore } from 'react';
import { Redirect } from 'expo-router';
import { previewCatalogue } from '../src/lib/runtime';
import { navigationSession as session } from '../src/lib/navigation';
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
