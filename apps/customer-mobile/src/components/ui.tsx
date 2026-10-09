import type { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { colors, fonts } from '../theme/tokens';
import { userMessage } from '../api/errors';
export function Body({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.body, style]} />;
}
export function Heading({ style, ...props }: TextProps) {
  return (
    <Text
      {...props}
      accessibilityRole="header"
      style={[styles.heading, style]}
    />
  );
}
export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Button({
  label,
  onPress,
  disabled,
  busy,
  secondary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        (disabled || busy) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? colors.goldText : colors.text} />
      ) : (
        <Body
          style={{
            color: secondary ? colors.goldText : colors.text,
            fontFamily: fonts.semibold,
            textAlign: 'center',
          }}
        >
          {label}
        </Body>
      )}
    </Pressable>
  );
}
export function TextAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.textAction}
    >
      <Body style={{ color: colors.goldText, fontFamily: fonts.medium }}>
        {label}
      </Body>
    </Pressable>
  );
}
export function StatusCard({
  title,
  detail,
  error,
  retry,
}: {
  title: string;
  detail?: string;
  error?: unknown;
  retry?: () => void;
}) {
  return (
    <Card>
      <Heading style={{ fontSize: 24 }}>{title}</Heading>
      <Body accessibilityLiveRegion={error ? 'polite' : 'none'}>
        {error ? userMessage(error) : detail}
      </Body>
      {retry && <TextAction label="Try again →" onPress={retry} />}
    </Card>
  );
}
export function Skeleton({ height = 90 }: { height?: number }) {
  return (
    <View
      accessibilityLabel="Loading"
      accessibilityState={{ busy: true }}
      style={{
        height,
        backgroundColor: colors.tint,
        borderRadius: 16,
        marginVertical: 6,
      }}
    />
  );
}
export const styles = StyleSheet.create({
  body: {
    fontFamily: fonts.body,
    color: colors.secondary,
    fontSize: 14,
    lineHeight: 21,
  },
  heading: {
    fontFamily: fonts.display,
    color: colors.text,
    fontSize: 36,
    lineHeight: 40,
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  button: {
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: colors.gold,
    justifyContent: 'center',
  },
  secondaryButton: {
    backgroundColor: colors.tint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textAction: { minHeight: 44, justifyContent: 'center', paddingVertical: 8 },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    fontFamily: fonts.body,
    color: colors.text,
    backgroundColor: colors.surface,
    fontSize: 16,
  },
  page: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 18, gap: 16, paddingBottom: 32 },
});
