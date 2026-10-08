import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { router, Redirect } from 'expo-router';
import { Image } from 'expo-image';
import { randomUUID } from 'expo-crypto';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import {
  CodeField,
  Cursor,
  useBlurOnFulfill,
  useClearByFocusCell,
} from 'react-native-confirmation-code-field';
import { Brand } from '../../components/Brand';
import { Body, Button, Heading, TextAction, styles } from '../../components/ui';
import { colors, fonts } from '../../theme/tokens';
import { assets } from '../collection/assets';
import { api } from '../../api';
import { session } from '../../lib/runtime';
import { ApiError, userMessage } from '../../api/errors';
import { getChallenge, setChallenge } from './challenge';
import { authFlow } from './flow';
const flow = authFlow(api, session, randomUUID);
function OtpInput({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  const ref = useBlurOnFulfill({ value, cellCount: 6 });
  const [props, getCellOnLayoutHandler] = useClearByFocusCell({
    value,
    setValue: onChange,
  });
  return (
    <CodeField
      ref={ref}
      {...props}
      value={value}
      onChangeText={(text) => onChange(text.replace(/\D/g, ''))}
      cellCount={6}
      keyboardType="number-pad"
      textContentType="oneTimeCode"
      autoComplete="one-time-code"
      accessibilityLabel="Six digit verification code"
      rootStyle={{ marginVertical: 20, gap: 6 }}
      renderCell={({ index, symbol, isFocused }) => (
        <Text
          key={index}
          onLayout={getCellOnLayoutHandler(index)}
          style={{
            flex: 1,
            height: 56,
            lineHeight: 54,
            textAlign: 'center',
            borderWidth: 1,
            borderColor: invalid
              ? colors.error
              : isFocused
                ? colors.gold
                : colors.border,
            borderRadius: 9,
            fontSize: 24,
            fontFamily: fonts.body,
            color: colors.text,
            backgroundColor: invalid ? '#FCEDE9' : colors.surface,
          }}
        >
          {symbol || (isFocused ? <Cursor /> : null)}
        </Text>
      )}
    />
  );
}
export default function OtpScreen() {
  const [intent, setIntent] = useState(getChallenge);
  const [error, setError] = useState<string>();
  const [resending, setResending] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting, isValid },
  } = useForm({ defaultValues: { code: '' }, mode: 'onChange' });
  if (!intent) return <Redirect href="/login" />;
  const submit = handleSubmit(async ({ code }) => {
    setError(undefined);
    try {
      await flow.verify(intent.reference, code);
      setChallenge(null);
      router.replace('/');
    } catch (error) {
      setError(
        error instanceof ApiError && error.status === 401
          ? 'The code you entered is incorrect or expired. Please try again.'
          : userMessage(error),
      );
    }
  });
  const resend = async () => {
    if (resending || isSubmitting) return;
    setResending(true);
    setError(undefined);
    try {
      const next = await flow.start(intent.phone);
      const nextIntent = { ...intent, reference: next.challenge_reference };
      setIntent(nextIntent);
      setChallenge(nextIntent);
      reset();
    } catch (error) {
      setError(userMessage(error));
    } finally {
      setResending(false);
    }
  };
  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: 'center', marginTop: 16 }}>
          <Brand />
        </View>
        <Image
          source={assets.otp}
          accessibilityLabel="A lit diya with flowers"
          style={{
            height: 176,
            width: '100%',
            marginVertical: 22,
            borderRadius: 20,
          }}
          contentFit="cover"
        />
        <Heading>Verify mobile number</Heading>
        <Body>We have sent a 6-digit verification code to</Body>
        <Body style={{ color: colors.text, fontFamily: fonts.semibold }}>
          {intent.phone.replace(/(\+91)\d{6}(\d{4})/, '$1 •••••• $2')}
        </Body>
        <Controller
          control={control}
          name="code"
          rules={{ required: true, pattern: /^\d{6}$/ }}
          render={({ field }) => (
            <OtpInput
              value={field.value}
              onChange={field.onChange}
              invalid={!!error}
            />
          )}
        />
        {error && (
          <Body
            accessibilityRole="alert"
            style={{ color: colors.error, marginBottom: 18 }}
          >
            {error}
          </Body>
        )}
        <Button
          label="Verify →"
          onPress={() => void submit()}
          disabled={!isValid || resending}
          busy={isSubmitting}
        />
        <View style={{ alignItems: 'center', marginTop: 28 }}>
          <Body>Didn’t receive the code?</Body>
          <TextAction
            label={resending ? 'Sending code…' : 'Resend code'}
            onPress={() => void resend()}
          />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
