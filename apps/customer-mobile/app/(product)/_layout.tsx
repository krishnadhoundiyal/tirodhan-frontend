import { useSyncExternalStore } from 'react';
import { Redirect, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { Brand } from '../../src/components/Brand';
import {
  Body,
  Button,
  Heading,
  Skeleton,
  styles,
} from '../../src/components/ui';
import { logout, previewCatalogue } from '../../src/lib/runtime';
import { navigationSession as session } from '../../src/lib/navigation';
import { productAdmission } from '../../src/session/admission';
import { userMessage } from '../../src/api/errors';
export default function ProductLayout() {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const admission = productAdmission(state, previewCatalogue);
  if (admission === 'login') return <Redirect href="/login" />;
  if (admission !== 'admitted')
    return (
      <SafeAreaView style={styles.page}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: 80 }]}
        >
          <Brand large />
          <Heading>
            {admission === 'forbidden'
              ? 'Customer access unavailable'
              : 'Your account is being connected'}
          </Heading>
          <Body>
            {admission === 'forbidden'
              ? 'This account does not currently have access to Customer Mobile.'
              : admission === 'loading'
                ? 'Loading your account access…'
                : userMessage(state.principalError)}
          </Body>
          {admission === 'loading' && <Skeleton />}
          <Button
            label="Try again"
            disabled={admission === 'loading'}
            onPress={() => void session.loadPrincipal()}
          />
          <Button
            secondary
            label="Sign out"
            onPress={() => void logout().catch(() => {})}
          />
        </ScrollView>
      </SafeAreaView>
    );
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
