import { useEffect, useState } from 'react';
import { TextInput } from 'react-native';
import { Redirect } from 'expo-router';
import { auth, nativeAuth, preview } from '../runtime';
import { useSession } from '../hooks';
import { Body, Button, ErrorState, Page, styles, Muted } from '../ui';
import { Admission } from './Admission';
export default function Login() {
  const state = useSession();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(
    () => () => {
      auth.clear();
    },
    [],
  );
  if (preview || state.status === 'authenticated')
    return (
      <Admission>
        <Redirect href="/(rider)" />
      </Admission>
    );
  if (state.status === 'starting' && nativeAuth) return <Admission />;
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (step === 'phone') {
        await auth.start(phone.trim());
        setStep('code');
      } else {
        await auth.verify(code);
        setCode('');
      }
    } catch (problem) {
      setError(problem);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page
      title={
        step === 'phone' ? 'Your Rider shift starts here' : 'Verify your phone'
      }
    >
      <Body>
        Sign in with the phone number registered with Tirodhan operations.
      </Body>
      {!nativeAuth ? (
        <Body>
          Live authentication requires the native Rider app and OS secure
          storage. Web is available for development fixtures only.
        </Body>
      ) : (
        <>
          {step === 'phone' ? (
            <TextInput
              accessibilityLabel="Phone number including country code"
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+91…"
              autoComplete="tel"
              keyboardType="phone-pad"
              editable={!busy}
              maxLength={16}
            />
          ) : (
            <>
              <TextInput
                accessibilityLabel="One-time verification code"
                style={styles.input}
                value={code}
                onChangeText={setCode}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                keyboardType="number-pad"
                secureTextEntry
                editable={!busy}
                maxLength={32}
              />
              <Muted>
                Only the service can verify the code. Codes are held in memory
                for this attempt.
              </Muted>
            </>
          )}
          <ErrorState error={error} />
          <Button
            title={
              busy
                ? 'Please wait…'
                : step === 'phone'
                  ? 'Send verification code'
                  : 'Verify and sign in'
            }
            disabled={
              busy ||
              (step === 'phone'
                ? !/^\+[1-9]\d{7,14}$/.test(phone.trim())
                : !/^\d{1,32}$/.test(code))
            }
            onPress={() => void submit()}
          />
          {step === 'code' && (
            <Button
              title="Use another phone number"
              disabled={busy}
              onPress={() => {
                auth.clear();
                setCode('');
                setStep('phone');
                setError(null);
              }}
            />
          )}
        </>
      )}
    </Page>
  );
}
