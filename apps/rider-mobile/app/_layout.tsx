import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { CormorantGaramond_600SemiBold } from '@expo-google-fonts/cormorant-garamond';
import {
  nativeAuth,
  preview,
  queryClient,
  session,
  recheckSession,
} from '../src/runtime';
import { useSession } from '../src/hooks';
export default function RootLayout() {
  const state = useSession();
  useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    CormorantGaramond_600SemiBold,
  });
  useEffect(() => {
    if (!preview && nativeAuth) void session.bootstrap();
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (
        status === 'active' &&
        !preview &&
        session.getSnapshot().status === 'authenticated'
      )
        void recheckSession().catch(() => {});
    });
    return () => subscription.remove();
  }, []);
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <QueryClientProvider client={queryClient}>
          <Stack
            key={preview ? 'preview' : state.ownerVersion}
            screenOptions={{ headerShown: false }}
          />
        </QueryClientProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
