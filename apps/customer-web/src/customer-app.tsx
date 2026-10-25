import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Header, Footer, Gate, normalizePath, metadata } from './public';
import {
  CustomerError,
  safeMessage,
  serviceState,
  type Address,
  type Context,
} from './api/contracts';
import type { Prepared } from './api/customer';
import type { Runtime } from './runtime';
import { ProductArea, AuthForm } from './features/product';
import { LocationControls } from './features/location-controls';
import { needsAddressConfirmation } from './parity/features/addresses/distance';

function usePath() {
  const [path, setPath] = useState(() => normalizePath(location.pathname));
  useEffect(() => {
    const pop = () => setPath(normalizePath(location.pathname));
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  const navigate = (next: string) => {
    history.pushState(null, '', next);
    setPath(next);
  };
  useEffect(() => {
    document.title = metadata(path).title;
    let tag = document.querySelector('meta[name="robots"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'robots');
      document.head.append(tag);
    }
    tag.setAttribute('content', 'noindex, nofollow');
    document.getElementById('account-title')?.focus();
  }, [path]);
  return { path, navigate };
}
export function CustomerApp({ runtime }: { runtime: Runtime }) {
  const state = useSyncExternalStore(
    runtime.session.subscribe,
    runtime.session.snapshot,
  );
  const { path, navigate } = usePath();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function action(fn: () => Promise<unknown>) {
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
    <QueryClientProvider client={runtime.client}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header path={path} />
      {runtime.development?.banner}
      <main id="main" className="account-page" tabIndex={-1}>
        <div className="account-heading">
          <div>
            <p className="eyebrow">YOUR CUSTOMER SPACE</p>
            <h1 id="account-title" tabIndex={-1}>
              Your account
            </h1>
          </div>
          {state.phase === 'ready' && (
            <button
              className="button secondary small"
              disabled={busy}
              onClick={() => void action(() => runtime.session.logout())}
            >
              Log out
            </button>
          )}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {state.phase !== 'ready' ? (
          <>
            {state.phase === 'unavailable' ? (
              <Gate />
            ) : (
              <section className="notice">
                <h2>
                  {state.phase === 'denied'
                    ? 'CUSTOMER membership required.'
                    : state.phase === 'checking'
                      ? 'Checking the current customer…'
                      : 'Customer access'}
                </h2>
                <p>
                  Admission requires the current backend principal and CUSTOMER
                  membership. Access grants alone do not establish admission.
                </p>
                {runtime.development &&
                  state.phase === 'signedOut' &&
                  !state.logoutUnconfirmed && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => void action(runtime.development!.signIn)}
                    >
                      {runtime.development.signInLabel}
                    </button>
                  )}
                {state.logoutUnconfirmed && (
                  <>
                    <p>
                      Sign-out is not confirmed. Confirm it before starting a
                      new session.
                    </p>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        void action(() => runtime.session.logout())
                      }
                    >
                      Retry sign-out
                    </button>
                  </>
                )}
              </section>
            )}
            <AuthForm runtime={runtime} />
            <div className="account-reserved">
              <h2>What your account will include</h2>
              <p>
                Your complete collection journey, including saved addresses,
                booking, payment, activity and account preferences. Live access
                awaits verified secure browser authentication.
              </p>
            </div>
          </>
        ) : (
          <Account
            key={state.epoch}
            runtime={runtime}
            path={path}
            navigate={navigate}
            owner={state.principal!.user_id}
          />
        )}
      </main>
      <Footer />
    </QueryClientProvider>
  );
}
function Account({
  runtime,
  path,
  navigate,
  owner,
}: {
  runtime: Runtime;
  path: string;
  navigate: (path: string) => void;
  owner: string;
}) {
  const links = [
    ['', 'Account overview'],
    ['catalogue', 'Collection catalogue'],
    ['review', 'Book a pickup'],
    ['addresses', 'Saved addresses'],
    ['serviceability', 'Service availability'],
    ['bookings', 'Bookings'],
    ['activity', 'Activity'],
    ['profile', 'Edit profile'],
    ['preferences', 'Language & updates'],
    ['favourites', 'Favourites'],
    ['payment-methods', 'Payment methods'],
    ['notifications', 'Notifications'],
    ['feedback', 'Share feedback'],
    ['information/help', 'Help & Support'],
  ];
  return (
    <div className="account-layout">
      <aside>
        <nav aria-label="Customer account">
          {links.map(([route, label]) => {
            const href = route ? `/account/${route}` : '/account';
            return (
              <a
                key={href}
                href={href}
                aria-current={path === href ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(href);
                }}
              >
                {label}
              </a>
            );
          })}
        </nav>
        <p className="fine">
          CUSTOMER access
          <br />
          Verified principal
        </p>
      </aside>
      <div>
        {path !== '/account/addresses' &&
          path !== '/account/serviceability' && (
            <ProductArea runtime={runtime} path={path} navigate={navigate} />
          )}
        <div
          hidden={
            path !== '/account/addresses' && path !== '/account/serviceability'
          }
        >
          <AddressManager
            runtime={runtime}
            owner={owner}
            serviceOnly={path === '/account/serviceability'}
          />
        </div>
      </div>
    </div>
  );
}
function AddressManager({
  runtime,
  owner,
  serviceOnly,
}: {
  runtime: Runtime;
  owner: string;
  serviceOnly: boolean;
}) {
  const state = runtime.session.snapshot();
  const model = runtime.customer();
  const query = useQuery({
    queryKey: ['customer-addresses', owner, state.epoch],
    queryFn: ({ signal }) => runtime.api.addresses(signal),
  });
  const [selection, setSelection] = useState<string | null>(null);
  const [addressSearch, setAddressSearch] = useState('');
  const [distant, setDistant] = useState<{
    address: Address;
    distance: number;
  } | null>(null);
  const [form, setForm] = useState<Address | 'new' | null>(null);
  const [archive, setArchive] = useState<Address | null>(null);
  const [archiveCommand, setArchiveCommand] =
    useState<Prepared<Address> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [check, setCheck] = useState<Context | undefined>();
  const [checkCommand, setCheckCommand] = useState<Prepared<Context> | null>(
    null,
  );
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [now, setNow] = useState(Date.now());
  const checkAbort = useRef<AbortController | null>(null);
  const checkGeneration = useRef(0);
  const panelTitle = useRef<HTMLHeadingElement>(null);
  const archiveTitle = useRef<HTMLHeadingElement>(null);
  const archiveTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (archive) archiveTitle.current?.focus();
  }, [archive]);
  const current = query.data?.find((a) => a.address_id === selection);
  const locked = Boolean(archiveCommand || checkCommand);
  useEffect(() => {
    if (!check) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [check]);
  useEffect(
    () => () => {
      checkGeneration.current++;
      checkAbort.current?.abort();
    },
    [],
  );
  function clearCheck() {
    checkGeneration.current++;
    checkAbort.current?.abort();
    setCheck(undefined);
    setCheckError('');
    setChecking(false);
  }
  async function reload() {
    clearCheck();
    if (model.snapshot().address)
      model.invalidateAddress(model.snapshot().address!.address_id);
    setSelection(null);
    await query.refetch();
    panelTitle.current?.focus();
  }
  function select(a: Address, confirmed = false) {
    const distance = needsAddressConfirmation(
      a,
      model.snapshot().currentLocation,
      model.snapshot().confirmedAddress,
    );
    if (distance !== null && !confirmed) {
      setDistant({ address: a, distance });
      return;
    }
    try {
      model.selectAddress(a);
      if (confirmed) model.confirmAddress();
    } catch {
      setError('Resolve the prepared booking before changing its address.');
      return;
    }
    setDistant(null);
    clearCheck();
    setSelection(a.address_id);
  }
  async function remove() {
    if (!archive || busy) return;
    setBusy(true);
    setError('');
    try {
      model.editable();
      const command = archiveCommand ?? runtime.api.archive(archive);
      setArchiveCommand(command);
      await command.execute();
      setArchiveCommand(null);
      setArchive(null);
      await reload();
    } catch (e) {
      setError(safeMessage(e));
      if (
        e instanceof CustomerError &&
        ['input', 'notFound', 'forbidden'].includes(e.kind)
      )
        setArchiveCommand(null);
    } finally {
      setBusy(false);
    }
  }
  async function checkAddress() {
    if (!current || checking) return;
    const generation = ++checkGeneration.current;
    checkAbort.current?.abort();
    checkAbort.current = new AbortController();
    setChecking(true);
    setCheckError('');
    setCheck(undefined);
    try {
      const command = checkCommand ?? runtime.api.check(current);
      setCheckCommand(command);
      const result = await command.execute();
      if (generation !== checkGeneration.current) return;
      setCheck(result);
      model.checkContext(result);
      setCheckCommand(null);
      setNow(Date.now());
    } catch (e) {
      if (generation === checkGeneration.current) {
        setCheckError(safeMessage(e));
        if (
          e instanceof CustomerError &&
          ['input', 'notFound', 'forbidden'].includes(e.kind)
        )
          setCheckCommand(null);
      }
    } finally {
      if (generation === checkGeneration.current) setChecking(false);
    }
  }
  async function refreshCheck() {
    if (!check || !current || checking) return;
    const source = check,
      generation = ++checkGeneration.current;
    checkAbort.current?.abort();
    checkAbort.current = new AbortController();
    setChecking(true);
    setCheckError('');
    setCheck(undefined);
    try {
      const value = await runtime.api.readCheck(
        source,
        current,
        checkAbort.current.signal,
      );
      if (generation === checkGeneration.current) {
        setCheck(value);
        model.checkContext(value);
        setNow(Date.now());
      }
    } catch (e) {
      if (generation === checkGeneration.current) setCheckError(safeMessage(e));
    } finally {
      if (generation === checkGeneration.current) setChecking(false);
    }
  }
  const service = serviceState(check, current, now);
  const labels = {
    changed: 'Choose an address and start a new check.',
    expired: 'This check has expired. Start a new check.',
    PENDING:
      'Your address check is pending. Read the latest persisted result when you are ready.',
    SERVICEABLE:
      'This address is serviceable. No collection slot or time is confirmed.',
    UNSERVICEABLE: 'This address is currently unserviceable.',
    TECHNICAL_FAILURE:
      'The address check could not be completed. No coverage is confirmed.',
  };
  return (
    <>
      <LocationControls model={model} />
      {distant && (
        <section className="notice">
          <h3>Confirm pickup location</h3>
          <p>
            This saved address is approximately {Math.round(distant.distance)}{' '}
            km from your current location. This is an approximate straight-line
            distance, not serviceability.
          </p>
          <button onClick={() => select(distant.address, true)}>
            Use this address
          </button>
          <button onClick={() => setDistant(null)}>
            Choose another address
          </button>
        </section>
      )}
      <div className="panel-heading">
        <div>
          <h2 ref={panelTitle} tabIndex={-1}>
            {serviceOnly ? 'Address-specific availability' : 'Saved addresses'}
          </h2>
          <p>Manual entry. No location permission required.</p>
        </div>
        <button
          className="button secondary small"
          disabled={locked || busy || Boolean(form) || query.isFetching}
          onClick={() => void reload()}
        >
          Reload addresses
        </button>
      </div>
      {query.isPending ? (
        <p role="status">Loading saved addresses…</p>
      ) : query.isError ? (
        <p className="error" role="alert">
          {safeMessage(query.error)}
        </p>
      ) : query.isFetching ? (
        <p role="status">Refreshing saved addresses…</p>
      ) : (
        <>
          {query.data.length === 0 && (
            <p className="empty">No saved addresses yet. Add one to begin.</p>
          )}
          <label>
            Search saved addresses
            <input
              value={addressSearch}
              onChange={(e) => setAddressSearch(e.target.value)}
              type="search"
            />
          </label>
          <div className="address-list">
            {query.data
              .filter((a) =>
                `${a.label ?? ''} ${a.address}`
                  .toLocaleLowerCase()
                  .includes(addressSearch.trim().toLocaleLowerCase()),
              )
              .map((a) => (
                <article
                  className={`address-card ${current?.address_id === a.address_id ? 'selected' : ''}`}
                  key={a.address_id}
                >
                  <div>
                    <h3>
                      {a.label ?? 'Saved address'}{' '}
                      {a.is_default && <span className="badge">Default</span>}
                    </h3>
                    <p className="address-text">{a.address}</p>
                    <p className="fine">
                      Version {a.version} ·{' '}
                      {current?.address_id === a.address_id
                        ? 'Current selection'
                        : 'Active'}
                    </p>
                  </div>
                  <div className="actions">
                    <button
                      className="button secondary small"
                      disabled={locked || Boolean(form) || busy}
                      aria-pressed={current?.address_id === a.address_id}
                      onClick={() => select(a)}
                    >
                      Select address
                    </button>
                    <button
                      className="text-button"
                      disabled={locked || Boolean(form) || busy}
                      onClick={() => {
                        clearCheck();
                        setArchive(null);
                        setForm(a);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="text-button"
                      disabled={locked || Boolean(form) || busy}
                      onClick={() => {
                        setError('');
                        archiveTrigger.current =
                          document.activeElement as HTMLElement;
                        setArchive(a);
                      }}
                    >
                      Archive
                    </button>
                  </div>
                </article>
              ))}
          </div>
          {!form && (
            <button
              className="button secondary"
              disabled={locked || busy}
              onClick={() => {
                setArchive(null);
                setForm('new');
              }}
            >
              Add an address <span aria-hidden="true">+</span>
            </button>
          )}
        </>
      )}
      {form && (
        <AddressForm
          key={form === 'new' ? 'new' : `${form.address_id}:${form.version}`}
          runtime={runtime}
          existing={form === 'new' ? undefined : form}
          onDone={() => {
            setForm(null);
            void reload();
          }}
        />
      )}
      {archive && (
        <section
          className="notice archive-confirm"
          aria-label="Archive confirmation"
        >
          <h3 ref={archiveTitle} tabIndex={-1}>
            Archive {archive.label ?? 'this address'}?
          </h3>
          <p>
            It will no longer appear in your active addresses. This does not
            change any earlier transaction snapshot.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => void remove()}
            >
              {busy
                ? 'Archiving…'
                : archiveCommand
                  ? 'Retry identical archive'
                  : 'Confirm archive'}
            </button>
            <button
              className="text-button"
              disabled={busy || Boolean(archiveCommand)}
              onClick={() => {
                setArchive(null);
                archiveTrigger.current?.focus();
              }}
            >
              Keep address
            </button>
          </div>
          {archiveCommand && (
            <p className="fine">
              The command is retained in memory until confirmed. Retry uses the
              same identity; no automatic business retry occurs.
            </p>
          )}
        </section>
      )}
      <section className="service-panel">
        <p className="eyebrow">ADDRESS-SPECIFIC CHECK</p>
        <h2>Is collection available here?</h2>
        <p>
          {current
            ? `Selected: ${current.label ?? 'Saved address'} · version ${current.version}`
            : 'Select a current saved address first.'}
        </p>
        {runtime.development?.controls}
        <div className="actions">
          <button
            className="button"
            disabled={
              !current ||
              checking ||
              Boolean(form) ||
              Boolean(archiveCommand) ||
              query.isFetching ||
              query.isError
            }
            onClick={() => void checkAddress()}
          >
            {checking
              ? 'Checking…'
              : checkCommand
                ? 'Retry identical check'
                : 'Check selected address'}
          </button>
          {check && service === 'PENDING' && (
            <button
              className="button secondary"
              disabled={checking || query.isFetching || query.isError}
              onClick={() => void refreshCheck()}
            >
              Read latest result
            </button>
          )}
        </div>
        {checkError ? (
          <p className="error" role="alert">
            {checkError}
          </p>
        ) : (
          <p className="check-state" role="status">
            {checking
              ? 'Reading authoritative serviceability…'
              : query.isError || query.isFetching
                ? 'Address information must be reloaded before showing availability.'
                : labels[service]}
          </p>
        )}
        {checkCommand && (
          <p className="fine">
            An unconfirmed check is retained. Retry sends the identical request
            and idempotency key.
          </p>
        )}
        {check &&
          service !== 'changed' &&
          service !== 'expired' &&
          !query.isError &&
          !query.isFetching && (
            <p className="fine">
              Valid until {new Date(check.expires_at).toLocaleString()}. No
              automatic polling. A new address version needs a new check.
            </p>
          )}
        <p className="fine">
          Continue to Book a pickup to choose categories, review the backend
          price and select a projected slot.
        </p>
      </section>
    </>
  );
}
function AddressForm({
  runtime,
  existing,
  onDone,
}: {
  runtime: Runtime;
  existing?: Address;
  onDone: () => void;
}) {
  const [label, setLabel] = useState(existing?.label ?? '');
  const [address, setAddress] = useState(existing?.address ?? '');
  const model = runtime.customer();
  const point = useSyncExternalStore(
    model.subscribe,
    model.snapshot,
  ).currentLocation;
  const pointSignature = point
    ? JSON.stringify([address.trim(), point.latitude, point.longitude])
    : null;
  const [pointConfirmation, setPointConfirmation] = useState<string | null>(
    null,
  );
  const [isDefault, setDefault] = useState(existing?.is_default ?? false);
  const [prepared, setPrepared] = useState<Prepared<Address> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus();
  }, []);
  async function save() {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      runtime.customer().editable();
      const body = {
        address: address.trim(),
        label: label.trim() || null,
        is_default: isDefault,
        location:
          existing && address.trim() !== existing.address.trim()
            ? null
            : pointConfirmation === pointSignature && point
              ? point
              : (existing?.location ?? null),
      };
      const command =
        prepared ??
        (existing
          ? runtime.api.update(existing, body)
          : runtime.api.create(body));
      setPrepared(command);
      await command.execute();
      setPrepared(null);
      onDone();
    } catch (e) {
      setError(safeMessage(e));
      if (e instanceof CustomerError && e.kind === 'conflict')
        setConflict(true);
      else if (
        e instanceof CustomerError &&
        ['input', 'notFound', 'forbidden'].includes(e.kind)
      )
        setPrepared(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="address-form">
      <h2 ref={title} tabIndex={-1}>
        {existing ? 'Edit address' : 'Add a new address'}
      </h2>
      <p>
        Enter a complete household address. Location permission is not needed.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy || Boolean(prepared)}>
          <legend className="sr-only">Address information</legend>
          <label>
            Address label <span className="fine">(optional)</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              autoComplete="off"
            />
          </label>
          <label>
            Complete address
            <textarea
              required
              maxLength={2000}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoComplete="street-address"
              rows={4}
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              disabled={
                !point ||
                (!!existing && address.trim() !== existing.address.trim())
              }
              checked={
                pointConfirmation === pointSignature && !!pointConfirmation
              }
              onChange={(e) =>
                setPointConfirmation(e.target.checked ? pointSignature : null)
              }
            />
            Attach the explicitly selected location to this exact address
          </label>
          {existing && address.trim() !== existing.address.trim() && (
            <p className="fine">
              Changing address text removes previous coordinates. Save the text
              first, then explicitly attach a fresh location in a new edit.
            </p>
          )}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setDefault(e.target.checked)}
            />
            Make this my default address
          </label>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {prepared && (
          <p className="fine">
            This submitted address is locked while its outcome is unconfirmed.
            Retrying keeps the exact body, version and idempotency key. Leaving
            or reloading this document loses its in-memory recovery.
          </p>
        )}
        <div className="actions">
          <button className="button" type="submit" disabled={busy}>
            {busy
              ? 'Saving…'
              : prepared
                ? 'Retry identical save'
                : 'Save address'}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy || Boolean(prepared)}
            onClick={onDone}
          >
            Close form
          </button>
        </div>
        {conflict && (
          <p className="fine">
            A 409 does not distinguish version conflict from an in-progress
            command. The submitted command stays locked; a confirmed result or
            separate reconciliation is needed before a replacement edit.
          </p>
        )}
      </form>
    </section>
  );
}
export function mountCustomer(element: HTMLElement, runtime: Runtime) {
  createRoot(element).render(<CustomerApp runtime={runtime} />);
}
