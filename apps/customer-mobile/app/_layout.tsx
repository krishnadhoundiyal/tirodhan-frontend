import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform, View } from 'react-native';
import { Stack, router, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Splash from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { queryClient, session } from '../src/lib/runtime';
import { installNotifications } from '../src/notifications/integration';
import { DraftProvider } from '../src/features/collection/DraftProvider';
import SplashScreen from '../src/features/auth/SplashScreen';
import { Button, Heading, Body } from '../src/components/ui';
import { colors } from '../src/theme/tokens';
import { repositories } from '../src/lib/repositories';
void Splash.preventAutoHideAsync().catch(() => {});
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        justifyContent: 'center',
        backgroundColor: colors.cream,
      }}
    >
      <Heading>Let’s try that again</Heading>
      <Body>
        We couldn’t display this screen. Your collection state remains with
        Tirodhan.
      </Body>
      <Button label="Try again" onPress={retry} />
    </View>
  );
}
export default function RootLayout() {
  const [loaded, fontError] = useFonts({
    Inter_400Regular: require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
    Inter_500Medium: require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
    Inter_600SemiBold: require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
    CormorantGaramond_600SemiBold: require('@expo-google-fonts/cormorant-garamond/600SemiBold/CormorantGaramond_600SemiBold.ttf'),
    TiroDevanagariHindi_400Regular: require('@expo-google-fonts/tiro-devanagari-hindi/400Regular/TiroDevanagariHindi_400Regular.ttf'),
  });
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useEffect(() => {
    void session.bootstrap();
  }, []);
  useEffect(() => {
    if (loaded || fontError) void Splash.hideAsync();
  }, [loaded, fontError]);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const listener = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
      if (state === 'active') {
        void session.renewIfExpired().catch(() => {});
        for (const key of [
          'collections',
          'collection',
          'payment',
          'refunds',
          'recommendations',
        ])
          void queryClient.invalidateQueries({ queryKey: [key] });
      }
    });
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (snapshot.status !== 'authenticated') return;
    return installNotifications((route) => router.navigate(route));
  }, [snapshot.status, snapshot.userId]);
  useEffect(() => {
    repositories.reset();
  }, [snapshot.ownerVersion]);
  if (fontError) throw new Error('Application fonts could not load');
  if (!loaded || snapshot.status === 'starting') return <SplashScreen />;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <DraftProvider
            key={`${snapshot.userId ?? 'signed-out'}:${snapshot.ownerVersion}`}
          >
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.cream },
              }}
            />
          </DraftProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
