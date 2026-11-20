import { QueryClientProvider } from '@tanstack/react-query';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import type { Runtime } from './runtime';
import {
  Account,
  Assignments,
  Incidents,
  Overview,
  Recovery,
  Riders,
  Routes,
} from './screens';
import { Reference } from './ui';
import { CommandCenter } from './command-ui';

const sections = [
  'Overview',
  'Riders',
  'Assignments',
  'Routes',
  'Recovery',
  'Incidents',
  'Account',
] as const;
type Section = (typeof sections)[number];
const routeUuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function currentLocation(): { section: Section; routeId?: string } {
  const [, area, id] = window.location.pathname.split('/');
  const section =
    sections.find((item) => item.toLowerCase() === area?.toLowerCase()) ??
    'Overview';
  return {
    section,
    routeId: section === 'Routes' && routeUuid.test(id ?? '') ? id : undefined,
  };
}
function Login({ runtime }: { runtime: Runtime }) {
  const admission = useSyncExternalStore(
    runtime.session.subscribe,
    runtime.session.snapshot,
  );
  const startCommand = useRef<{
    client_request_id: string;
    phone: string;
  } | null>(null);
  const verifyCommand = useRef<{
    client_login_id: string;
    challenge_reference: string;
    code: string;
  } | null>(null);
  const [phone, setPhone] = useState(''),
    [code, setCode] = useState(''),
    [challenge, setChallenge] = useState<string>(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (!challenge) {
        if (!startCommand.current || startCommand.current.phone !== phone)
          startCommand.current = {
            client_request_id: crypto.randomUUID(),
            phone,
          };
        setChallenge(await runtime.session.startOtp(startCommand.current));
        setPhone('');
        startCommand.current = null;
      } else {
        if (
          !verifyCommand.current ||
          verifyCommand.current.challenge_reference !== challenge ||
          verifyCommand.current.code !== code
        )
          verifyCommand.current = {
            client_login_id: crypto.randomUUID(),
            challenge_reference: challenge,
            code,
          };
        if (await runtime.session.verifyOtp(verifyCommand.current)) {
          setCode('');
          setChallenge(undefined);
          verifyCommand.current = null;
        }
      }
    } catch {
      setMessage('Authentication is unavailable. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      className="login-form"
    >
      {challenge ? (
        <label>
          One-time code
          <input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            disabled={busy || admission.phase === 'checking'}
          />
        </label>
      ) : (
        <label>
          Phone number
          <input
            type="tel"
            autoComplete="tel"
            placeholder="+91…"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
            disabled={busy || admission.phase === 'checking'}
            pattern="\+[1-9][0-9]{7,14}"
          />
        </label>
      )}
      <button disabled={busy || admission.phase === 'checking'} type="submit">
        {busy ? 'Verifying…' : challenge ? 'Verify code' : 'Request code'}
      </button>
      <button
        type="button"
        className="secondary"
        disabled={
          busy ||
          admission.phase === 'checking' ||
          admission.phase === 'authenticating'
        }
        onClick={() => {
          void runtime.session.logout().then(() => {
            if (runtime.session.snapshot().logoutUnconfirmed) return;
            startCommand.current = null;
            verifyCommand.current = null;
            setCode('');
            setPhone('');
            setChallenge(undefined);
            setMessage('');
          });
        }}
      >
        Start another sign-in
      </button>
      {admission.phase === 'checking' && (
        <p role="status">Verifying current principal…</p>
      )}
      {message && <p role="alert">{message}</p>}
    </form>
  );
}
function Admission({ runtime }: { runtime: Runtime }) {
  const state = useSyncExternalStore(
    runtime.session.subscribe,
    runtime.session.snapshot,
  );
  return (
    <main className="admission">
      <div className="admission-brand">
        <span className="brand-symbol" aria-hidden="true">
          त
        </span>
        <span>
          Tirodhan <small>Operations</small>
        </span>
      </div>
      <div className="admission-card">
        <p className="eyebrow">Manager workspace</p>
        <h1>
          {state.phase === 'unavailable'
            ? 'Web authentication is not yet available'
            : state.phase === 'denied'
              ? 'Manager access required'
              : 'Your operations workspace'}
        </h1>
        {state.phase === 'unavailable' ? (
          <>
            <p>Sign-in is unavailable in this environment.</p>
          </>
        ) : (
          <>
            {state.message && (
              <p
                role={
                  state.phase === 'denied' || state.phase === 'error'
                    ? 'alert'
                    : 'status'
                }
              >
                {state.message}
              </p>
            )}
            {state.logoutUnconfirmed ? (
              <button
                onClick={() => {
                  void runtime.session.logout();
                }}
              >
                Retry gateway sign-out
              </button>
            ) : state.phase === 'denied' ? (
              <button
                onClick={() => {
                  void runtime.session.logout();
                }}
              >
                Sign out of this web session
              </button>
            ) : runtime.kind === 'fixture' ? (
              <>
                <p>
                  Isolated development fixtures. No production API, real
                  credentials or operational commands.
                </p>
                <button
                  disabled={state.phase === 'checking'}
                  onClick={() => {
                    void runtime.session.restore();
                  }}
                >
                  {state.phase === 'checking'
                    ? 'Verifying fixture principal…'
                    : 'Enter fixture session'}
                </button>
              </>
            ) : (
              <>
                <Login runtime={runtime} />
                <button
                  disabled={
                    state.phase === 'checking' ||
                    state.phase === 'authenticating'
                  }
                  onClick={() => {
                    void runtime.session.restore();
                  }}
                >
                  Restore secure browser session
                </button>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
function Shell({ runtime }: { runtime: Runtime }) {
  const useLocation = runtime.kind === 'verified-adapter';
  const [{ section, routeId }, setLocation] = useState<{
    section: Section;
    routeId?: string;
  }>(() => (useLocation ? currentLocation() : { section: 'Overview' }));
  useEffect(() => {
    if (!useLocation) return;
    const syncLocation = () => setLocation(currentLocation());
    window.addEventListener('popstate', syncLocation);
    return () => window.removeEventListener('popstate', syncLocation);
  }, [useLocation]);
  const navigate = (next: Section, id?: string) => {
    if (useLocation) {
      const path =
        next === 'Overview'
          ? '/'
          : '/' +
            next.toLowerCase() +
            (id && routeUuid.test(id) ? '/' + id : '');
      if (window.location.pathname !== path)
        window.history.pushState(null, '', path);
    }
    setLocation((previous) => ({
      section: next,
      routeId: id ?? previous.routeId,
    }));
  };
  const openRoute = (id: string) => navigate('Routes', id);
  const screen =
    section === 'Overview' ? (
      <Overview runtime={runtime} />
    ) : section === 'Riders' ? (
      <Riders runtime={runtime} openRoute={openRoute} />
    ) : section === 'Assignments' ? (
      <Assignments runtime={runtime} />
    ) : section === 'Routes' ? (
      <Routes runtime={runtime} routeId={routeId} setRouteId={openRoute} />
    ) : section === 'Recovery' ? (
      <Recovery runtime={runtime} />
    ) : section === 'Incidents' ? (
      <Incidents runtime={runtime} />
    ) : (
      <Account runtime={runtime} />
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to operational content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-symbol" aria-hidden="true">
            त
          </span>
          <span>
            Tirodhan<small>OPERATIONS</small>
          </span>
        </div>
        <div className="workspace-label">
          Manager console <span>P0 · Manager decisions</span>
        </div>
        <nav aria-label="Operations">
          <ul>
            {sections.map((item, index) => (
              <li key={item}>
                <button
                  onClick={() =>
                    navigate(item, item === 'Routes' ? routeId : undefined)
                  }
                  aria-current={section === item ? 'page' : undefined}
                >
                  <span className="nav-number" aria-hidden="true">
                    0{index + 1}
                  </span>
                  {item}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <span className="availability-dot" />
          {runtime.kind === 'fixture'
            ? 'Development fixtures'
            : 'Verified manager session'}
          <button
            className="sidebar-signout"
            onClick={() => {
              void runtime.session.logout();
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Tirodhan / Manager</span>
            <strong>{section}</strong>
          </div>
          <div className="topbar-state">
            <span className="status neutral">
              {runtime.kind === 'fixture'
                ? 'Fixture simulation'
                : 'Manager session'}
            </span>
            <span className="muted">All times IST</span>
          </div>
        </header>
        {runtime.preview && (
          <section className="preview-banner" aria-label="Development preview">
            <div>
              <strong>Development fixture preview</strong>
              <p>
                Illustrative data. No real permissions, network calls or
                operational effects.
              </p>
            </div>
            <label>
              Scenario
              <select
                value={runtime.preview.current()}
                onChange={(event) => {
                  void runtime.preview?.change(event.target.value);
                }}
              >
                {runtime.preview.scenarios.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <button
              className="secondary"
              onClick={() => openRoute(runtime.preview!.routeId)}
            >
              Read sample route
            </button>
            <details>
              <summary>Fixture reference UUIDs</summary>
              {Object.entries(runtime.preview.references).map(([name, id]) => (
                <p key={name}>
                  {name}
                  <Reference value={id} />
                </p>
              ))}
            </details>
          </section>
        )}
        <main id="main-content" tabIndex={-1} className="content">
          {screen}
          <CommandCenter runtime={runtime} navigation={section} />
        </main>
        <footer className="page-footer">
          Tirodhan Operations · Backend state is authoritative · Explicit reads,
          bounded selected-resource reconciliation
        </footer>
      </div>
    </div>
  );
}
export default function App({ runtime }: { runtime: Runtime }) {
  const state = useSyncExternalStore(
    runtime.session.subscribe,
    runtime.session.snapshot,
  );
  return (
    <QueryClientProvider client={runtime.queries}>
      {state.phase === 'ready' && state.principal?.roles.includes('MANAGER') ? (
        <Shell key={state.epoch} runtime={runtime} />
      ) : (
        <Admission runtime={runtime} />
      )}
    </QueryClientProvider>
  );
}
