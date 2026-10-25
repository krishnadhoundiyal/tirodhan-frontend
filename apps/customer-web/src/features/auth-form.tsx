import { useState } from 'react';
import type { Runtime } from '../runtime';
import { safeMessage } from '../api/contracts';
export function AuthForm({ runtime }: { runtime: Runtime }) {
  const session = runtime.session;
  const [phone, setPhone] = useState(''),
    [code, setCode] = useState(''),
    [challenge, setChallenge] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const available =
    session.snapshot().phase === 'signedOut' &&
    !session.snapshot().logoutUnconfirmed &&
    !session.snapshot().cleanupPending;
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(safeMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-form">
      <h2>{challenge ? 'Verify your mobile number' : 'Welcome to Tirodhan'}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            if (challenge) {
              await session.login(challenge, code);
              setChallenge(null);
              setCode('');
              setPhone('');
            } else setChallenge(await session.startOtp(`+91${phone}`));
          });
        }}
      >
        <fieldset disabled={!available || busy}>
          <label>
            Mobile number · +91
            <input
              type="tel"
              autoComplete="tel-national"
              inputMode="numeric"
              pattern="[6-9][0-9]{9}"
              maxLength={10}
              required
              value={phone}
              readOnly={!!challenge}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          {challenge && (
            <label>
              Six digit verification code
              <input
                type="text"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                pattern="[0-9]{6}"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
          )}
          <button className="button" type="submit">
            {busy
              ? 'Please wait…'
              : challenge
                ? 'Verify and sign in'
                : 'Send verification code'}
          </button>
          {challenge && (
            <button
              type="button"
              className="text-button"
              onClick={() =>
                void action(async () => {
                  setCode('');
                  setChallenge(await session.startOtp(`+91${phone}`, true));
                })
              }
            >
              Resend code
            </button>
          )}
        </fieldset>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        className="text-button"
        disabled={!available || busy}
        onClick={() => void action(() => session.resume())}
      >
        Restore secure browser session
      </button>
      <p className="fine">
        <a href="/policies/terms">Service terms</a> ·{' '}
        <a href="/policies/privacy">Privacy publication status</a>.
        Authentication remains unavailable until approved secure web integration
        is verified.
      </p>
    </section>
  );
}
