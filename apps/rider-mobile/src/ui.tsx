import type { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fonts } from './theme/tokens';
import { userMessage } from './api/errors';
import { preview } from './runtime';
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream },
  content: {
    padding: 24,
    paddingBottom: 48,
    gap: 16,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontFamily: fonts.display, fontSize: 34, color: colors.text },
  body: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.secondary,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  button: {
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.goldText,
    backgroundColor: colors.tint,
    minHeight: 48,
  },
  buttonText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.goldText,
    textAlign: 'center',
  },
  input: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    backgroundColor: colors.surface,
    fontFamily: fonts.body,
    fontSize: 18,
    color: colors.text,
  },
});
export function Body({ children }: PropsWithChildren) {
  return <Text style={styles.body}>{children}</Text>;
}
export function Muted({ children }: PropsWithChildren) {
  return <Text style={styles.muted}>{children}</Text>;
}
export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}
export function Button({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress(): void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && { opacity: 0.5 }]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}
export function Page({
  title,
  children,
}: PropsWithChildren<{ title: string }>) {
  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Muted>TIRODHAN · RIDER</Muted>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {preview && (
        <Card>
          <Body>Development fixtures · No live Rider requests</Body>
        </Card>
      )}
      {children}
    </ScrollView>
  );
}
export function Loading({
  label = 'Loading current Rider state…',
}: {
  label?: string;
}) {
  return (
    <View accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.goldText} />
      <Body>{label}</Body>
    </View>
  );
}
export function ErrorState({ error }: { error: unknown }) {
  return error ? (
    <Text accessibilityRole="alert" style={styles.body}>
      {userMessage(error)}
    </Text>
  ) : null;
}
export function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not recorded';
}
