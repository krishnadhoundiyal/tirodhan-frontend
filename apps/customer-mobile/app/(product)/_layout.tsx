import { useSyncExternalStore } from 'react';
import { Redirect, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView } from 'react-native';
import { Brand } from '../../src/components/Brand';
import { Body, Button, Heading, styles } from '../../src/components/ui';
import { session, logout, previewCatalogue } from '../../src/lib/runtime';
export default function ProductLayout() {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  if (!previewCatalogue && state.status !== 'authenticated')
    return <Redirect href="/login" />;
  if (!previewCatalogue && !state.principal?.roles.includes('CUSTOMER'))
    return (
      <SafeAreaView style={styles.page}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: 80 }]}
        >
          <Brand large />
          <Heading>Your account is being connected</Heading>
          <Body>
            You’re signed in, but we can’t load the account information needed
            to open Tirodhan yet. Please try again later.
          </Body>
          <Button
            label="Try again"
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
      {previewCatalogue && (
        <Body
          style={{
            backgroundColor: '#F3E7D5',
            textAlign: 'center',
            fontSize: 10,
          }}
        >
          DEVELOPMENT DESIGN PREVIEW · Catalogue is temporary · Booking disabled
        </Body>
      )}
    </>
  );
}
