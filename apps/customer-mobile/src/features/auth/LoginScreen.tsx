import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { View, TextInput, StyleSheet } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Brand } from '../../components/Brand';
import { Body, Button, Heading, TextAction, styles } from '../../components/ui';
import { colors } from '../../theme/tokens';
import { api } from '../../api';
import { session, previewCatalogue } from '../../lib/runtime';
import { authFlow } from './flow';
import { userMessage } from '../../api/errors';
import { setChallenge } from './challenge';
const flow = authFlow(api, session, randomUUID);
export default function LoginScreen() {
  const {
    control,
    handleSubmit,
    formState: { isValid, isSubmitting },
  } = useForm({ defaultValues: { phone: '' }, mode: 'onChange' });
  const [error, setError] = useState<string>();
  const submit = handleSubmit(async ({ phone }) => {
    setError(undefined);
    try {
      const result = await flow.start(`+91${phone}`);
      setChallenge({
        reference: result.challenge_reference,
        phone: `+91${phone}`,
      });
      router.push('/otp');
    } catch (error) {
      setError(userMessage(error));
    }
  });
  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAwareScrollView
        contentContainerStyle={loginStyles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: 'center', marginTop: 70, marginBottom: 36 }}>
          <Brand large />
          <Body style={{ color: colors.gold, marginTop: 3 }}>
            ───── ◆ ─────
          </Body>
        </View>
        <Heading style={{ textAlign: 'center', fontSize: 34 }}>
          Welcome to Tirodhan
        </Heading>
        <Body style={{ textAlign: 'center', fontSize: 16, marginBottom: 26 }}>
          Continue with your mobile number
        </Body>
        <View style={loginStyles.phone}>
          <Body
            style={{ color: colors.text, fontSize: 19, paddingHorizontal: 16 }}
          >
            +91
          </Body>
          <Controller
            control={control}
            name="phone"
            rules={{ pattern: /^[6-9]\d{9}$/, required: true }}
            render={({ field: { value, onChange, onBlur } }) => (
              <TextInput
                accessibilityLabel="Mobile number"
                autoComplete="tel-national"
                keyboardType="phone-pad"
                maxLength={10}
                value={value}
                onChangeText={(text) => onChange(text.replace(/\D/g, ''))}
                onBlur={onBlur}
                placeholder="98765 43210"
                style={[
                  styles.input,
                  {
                    flex: 1,
                    borderWidth: 0,
                    borderLeftWidth: 1,
                    borderRadius: 0,
                  },
                ]}
              />
            )}
          />
        </View>
        {error && (
          <Body
            accessibilityRole="alert"
            style={{ color: colors.error, marginVertical: 12 }}
          >
            {error}
          </Body>
        )}
        <View style={{ marginTop: 24 }}>
          <Button
            label="Continue"
            disabled={!isValid}
            busy={isSubmitting}
            onPress={() => void submit()}
          />
        </View>
        <View style={{ marginTop: 54, alignItems: 'center' }}>
          <Body>By continuing, you agree to our</Body>
          <TextAction
            label="Terms & Privacy Policy"
            onPress={() =>
              router.push('/information?topic=Terms%20%26%20Privacy')
            }
          />
        </View>
        {previewCatalogue && (
          <TextAction
            label="Open development design preview →"
            onPress={() => router.replace('/(product)/(tabs)')}
          />
        )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
const loginStyles = StyleSheet.create({
  content: { padding: 24, flexGrow: 1, paddingBottom: 40 },
  phone: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
});
