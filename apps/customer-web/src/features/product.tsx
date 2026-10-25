import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  Component,
  type ReactNode,
} from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { Runtime } from '../runtime';
import type { CustomerExperience } from './customer-model';
import { ApiError, userMessage, isExpiredCursor } from '../parity/api/errors';
import { declarationItem } from '../parity/features/collection/declarations';
import {
  moneyLabel,
  paymentLabel,
  refundLabels,
} from '../parity/features/collection/financial';
import { slotSelectable, slotLabel } from '../parity/api/slot-contracts';
import { BoundBooking } from '../parity/features/collection/bookingFlow';
import { serviceState } from '../api/contracts';
import type {
  Catalogue,
  Category,
} from '../parity/features/collection/catalogue';
import type {
  CollectionDetail,
  MediaDto,
  CustomerProfile,
  CustomerPreferences,
  FavouriteCategories,
} from '../parity/api/customer-contracts';
import type { ItemDeclaration } from '../parity/features/collection/declarations';
import type { WeightPolicy } from '../parity/api/weight-contracts';
import { verifyPayment } from './payment';
import { AuthForm } from './auth-form';
export { AuthForm };
export class ProductBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section className="notice" role="alert">
        <h2>Let’s try that again.</h2>
        <p>
          Previously confirmed backend information remains unchanged. Reload to
          recover any retained command before starting a replacement.
        </p>
        <button className="button" onClick={() => location.reload()}>
          Reload customer application
        </button>
      </section>
    ) : (
      this.props.children
    );
  }
}
function ErrorView({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className="error" role="alert">
      <p>{userMessage(error)}</p>
      {retry && (
        <button className="text-button" onClick={retry}>
          Try reading again
        </button>
      )}
    </div>
  );
}
export function ProductMedia({
  media,
  model,
}: {
  media: (Omit<MediaDto, 'url'> & { url: string | null }) | null;
  model: CustomerExperience;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  let source: string | null = null;
  if (
    media &&
    (!media.expires_at || Date.parse(media.expires_at) > Date.now())
  ) {
    try {
      const raw = media.thumbnail_url ?? media.url;
      const u = raw ? new URL(raw) : null;
      if (
        u &&
        u.protocol === 'https:' &&
        !u.username &&
        !u.password &&
        !u.searchParams.getAll('sp').some((v) => v !== 'r')
      )
        source = model.options.mediaResolver
          ? model.options.mediaResolver({ ...media, url: media.url ?? u.href })
          : u.href;
    } catch {
      /* No unsafe URL. */
    }
  }
  return source && source !== failed ? (
    <img
      className="product-image"
      src={source}
      alt={media?.alt_text ?? 'Collection illustration'}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(source)}
    />
  ) : (
    <div
      className="product-image media-fallback"
      role="img"
      aria-label={media?.alt_text ?? 'Collection illustration unavailable'}
    >
      ✧
    </div>
  );
}
function useCatalogue(model: CustomerExperience) {
  return useQuery({
    queryKey: ['customer', model.owner, model.epoch, 'catalogue'],
    queryFn: ({ signal }) => model.repo.catalogue(signal),
    staleTime: 0,
  });
}
export function ProductArea({
  runtime,
  path,
  navigate,
}: {
  runtime: Runtime;
  path: string;
  navigate: (p: string) => void;
}) {
  const model = runtime.customer();
  useEffect(() => {
    const refresh = () => {
      if (model.current() && document.visibilityState === 'visible')
        void runtime.client.invalidateQueries({
          queryKey: ['customer', model.owner, model.epoch],
        });
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [model, runtime.client]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source && 'postMessage' in event.source) {
        const v = event.data as { kind?: string; data?: unknown };
        if (v?.kind === 'collection-signal' || v?.kind === 'collection-tap')
          model.notifications.signal(
            v.data,
            v.kind === 'collection-tap',
            (id) => {
              void runtime.client.invalidateQueries({
                queryKey: ['customer', model.owner, model.epoch],
              });
              if (id)
                void runtime.client.invalidateQueries({
                  queryKey: [
                    'customer',
                    model.owner,
                    model.epoch,
                    'detail',
                    id,
                  ],
                });
            },
            navigate,
          );
      }
    };
    navigator.serviceWorker?.addEventListener('message', receive);
    return () =>
      navigator.serviceWorker?.removeEventListener('message', receive);
  }, [model, navigate, runtime.client]);
  let content: ReactNode;
  if (path === '/account')
    content = <Overview model={model} navigate={navigate} />;
  else if (path === '/account/catalogue')
    content = <CatalogueView model={model} navigate={navigate} />;
  else if (path === '/account/review' || path === '/account/pickup')
    content = (
      <BookingWizard runtime={runtime} model={model} navigate={navigate} />
    );
  else if (path === '/account/activity' || path === '/account/bookings')
    content = (
      <Bookings
        model={model}
        navigate={navigate}
        bookings={path.endsWith('/bookings')}
      />
    );
  else if (/^\/account\/collections\/[a-f\d-]{36}$/i.test(path))
    content = <Detail model={model} id={path.split('/').at(-1)!} />;
  else if (
    path === '/account/profile' ||
    path === '/account/preferences' ||
    path === '/account/favourites' ||
    path === '/account/feedback'
  )
    content = (
      <AccountFeature
        key={path}
        model={model}
        section={path.split('/').at(-1)!}
      />
    );
  else if (path === '/account/payment-methods')
    content = <PaymentMethods model={model} />;
  else if (path === '/account/notifications')
    content = <Notifications model={model} navigate={navigate} />;
  else if (/^\/account\/information\/(help|about|privacy|terms)$/.test(path))
    content = <Information model={model} slug={path.split('/').at(-1)!} />;
  else
    content = (
      <section className="notice">
        <h2>This customer page is unavailable.</h2>
        <button onClick={() => navigate('/account')}>Return to account</button>
      </section>
    );
  return (
    <ProductBoundary key={model.epoch}>
      {content}
      {runtime.development?.financialControls}
    </ProductBoundary>
  );
}
function Overview({
  model,
  navigate,
}: {
  model: CustomerExperience;
  navigate: (p: string) => void;
}) {
  const profile = useQuery({
    queryKey: ['customer', model.owner, model.epoch, 'profile'],
    queryFn: ({ signal }) => model.repo.profile(signal),
  });
  return (
    <>
      <section className="notice">
        <p className="eyebrow">YOUR COLLECTION JOURNEY</p>
        <h2>
          {profile.isSuccess
            ? (profile.data.display_name ?? 'Your Tirodhan account')
            : 'Your Tirodhan account'}
        </h2>
        {profile.isSuccess && <p>{profile.data.phone_display}</p>}
        <button
          className="button"
          onClick={() => navigate('/account/catalogue')}
        >
          Begin a collection →
        </button>
      </section>
      <div className="account-link-grid">
        {[
          ['profile', 'Edit profile'],
          ['addresses', 'Saved addresses'],
          ['payment-methods', 'Payment methods'],
          ['favourites', 'Favourite collection items'],
          ['bookings', 'Bookings'],
          ['activity', 'Activity & history'],
          ['preferences', 'Language & service updates'],
          ['notifications', 'Notifications'],
          ['feedback', 'Share feedback'],
          ['information/help', 'Help & Support'],
          ['information/about', 'About Tirodhan'],
          ['information/terms', 'Service terms'],
          ['information/privacy', 'Privacy policy'],
        ].map(([path, label]) => (
          <a
            href={`/account/${path}`}
            key={path}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/account/${path}`);
            }}
          >
            {label} →
          </a>
        ))}
      </div>
      <h2 className="subheading">Your current journey</h2>
      <Bookings model={model} navigate={navigate} compact />
    </>
  );
}
function CatalogueView({
  model,
  navigate,
}: {
  model: CustomerExperience;
  navigate: (p: string) => void;
}) {
  const q = useCatalogue(model),
    draft = useSyncExternalStore(model.subscribe, model.snapshot);
  const rec = useQuery({
    queryKey: ['customer', model.owner, model.epoch, 'recommendations'],
    queryFn: ({ signal }) => model.repo.recommendations(signal),
  });
  const [error, setError] = useState('');
  function toggle(code: string) {
    try {
      model.selectCategory(code);
      setError('');
    } catch (e) {
      setError(userMessage(e));
    }
  }
  const recommendations =
    q.data && !rec.isError
      ? [
          ...new Map(
            (rec.data?.recommendations ?? [])
              .filter((r) => r.reason === 'PREVIOUS_COLLECTION')
              .sort((a, b) => a.rank - b.rank)
              .flatMap((r) => {
                const c = q.data.categories.find(
                  (c) => c.code === r.category_code && c.active,
                );
                return c ? [[c.code, c] as const] : [];
              }),
          ).values(),
        ]
      : [];
  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Collection catalogue</h2>
          <p>Select the items you would like collected.</p>
        </div>
        <button
          className="button secondary small"
          onClick={() => void q.refetch()}
        >
          Reload catalogue
        </button>
      </div>
      {q.isPending || q.isFetching ? (
        <p role="status">Loading collection items…</p>
      ) : q.isError ? (
        <ErrorView error={q.error} retry={() => void q.refetch()} />
      ) : (
        <>
          {q.data.quick.length > 0 && (
            <div
              className="quick-categories"
              aria-label="Quick collection categories"
            >
              {q.data.quick
                .filter((c) =>
                  q.data.categories.some(
                    (item) => item.code === c.categoryCode && item.active,
                  ),
                )
                .map((c) => (
                  <button
                    key={c.categoryCode}
                    aria-pressed={draft.codes.includes(c.categoryCode)}
                    onClick={() => toggle(c.categoryCode)}
                  >
                    {c.label}
                  </button>
                ))}
            </div>
          )}
          {recommendations.length > 0 && (
            <section>
              <h3>Based on your previous collections</h3>
              <div className="recommendations">
                {recommendations.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => {
                      if (!draft.codes.includes(c.code)) toggle(c.code);
                      navigate('/account/review');
                    }}
                  >
                    {c.name} →
                  </button>
                ))}
              </div>
            </section>
          )}
          {q.data.groups
            .filter((g) => g.active)
            .sort((a, b) => a.order - b.order)
            .map((g) => (
              <section className="catalogue-group" key={g.code}>
                <h3>{g.name}</h3>
                <div className="catalogue-cards">
                  {q.data.categories
                    .filter((c) => c.active && c.group === g.code)
                    .sort((a, b) => a.order - b.order)
                    .map((c) => (
                      <button
                        className="catalogue-card"
                        key={c.code}
                        role="checkbox"
                        aria-checked={draft.codes.includes(c.code)}
                        aria-label={`Select ${c.name}`}
                        onClick={() => toggle(c.code)}
                      >
                        <ProductMedia model={model} media={c.image} />
                        <strong>{c.name}</strong>
                        <span>{c.description}</span>
                        {c.handlingHints && <small>{c.handlingHints}</small>}
                        <span>
                          {draft.codes.includes(c.code)
                            ? '✓ Selected'
                            : '+ Select'}
                        </span>
                      </button>
                    ))}
                </div>
              </section>
            ))}
        </>
      )}
      {error !== undefined && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="review-bar">
        <span>{draft.codes.length} categories selected</span>
        <button
          className="button"
          onClick={() => navigate('/account/review')}
          disabled={!draft.codes.length}
        >
          Review your collection →
        </button>
      </div>
    </>
  );
}
function ItemDeclarationForm({
  model,
  category,
  policy,
}: {
  model: CustomerExperience;
  category: Category;
  policy: WeightPolicy;
}) {
  const draft = useSyncExternalStore(model.subscribe, model.snapshot),
    value = draft.declarations[category.code] ?? {};
  const current =
    value.policyId === policy.policy_id &&
    value.policyRevision === policy.policy_revision;
  const update = (change: Partial<ItemDeclaration>) =>
    model.declare(category.code, { ...value, ...change });
  return (
    <fieldset className="declaration">
      <legend>{category.name}</legend>
      <p>
        Weight and occupied volume cover the whole quantity, including
        packaging.
      </p>
      {!current && value.weightBand && (
        <p className="error" role="alert">
          Pricing bands changed. Select a current weight band again.
        </p>
      )}
      {(
        [
          [
            'BELOW_B',
            `${policy.first_band_label} · below ${policy.first_band_upper_grams / 1000} kg`,
          ],
          [
            'B_TO_T',
            `${policy.middle_band_label} · ${policy.first_band_upper_grams / 1000}–${policy.numerical_threshold_grams / 1000} kg`,
          ],
          [
            'ABOVE_T',
            `${policy.open_band_label} · above ${policy.numerical_threshold_grams / 1000} kg`,
          ],
        ] as const
      ).map(([band, label]) => (
        <label className="checkbox" key={band}>
          <input
            type="radio"
            name={`band-${category.code}`}
            checked={current && value.weightBand === band}
            onChange={() =>
              update({
                weightBand: band,
                weightKg: band === 'ABOVE_T' ? value.weightKg : undefined,
                policyId: policy.policy_id,
                policyRevision: policy.policy_revision,
              })
            }
          />
          {label}
        </label>
      ))}
      {value.weightBand === 'ABOVE_T' && (
        <label>
          Numerical kilograms for {category.name}
          <input
            inputMode="decimal"
            value={value.weightKg ?? ''}
            onChange={(e) => update({ weightKg: e.target.value })}
          />
        </label>
      )}
      {category.input.quantity === 'OPTIONAL' && (
        <label>
          Quantity for {category.name} (optional)
          <input
            inputMode="numeric"
            value={value.quantityText ?? ''}
            onChange={(e) => update({ quantityText: e.target.value })}
          />
        </label>
      )}
      <label>
        Occupied volume in litres for {category.name}
        <input
          inputMode="decimal"
          value={value.volumeLitres ?? ''}
          onChange={(e) => update({ volumeLitres: e.target.value })}
        />
      </label>
      <p className="fine">
        1 litre = 1000 ml. Use at most 3 decimal places. No weight or price is
        inferred from quantity.
      </p>
      {!declarationItem(category, value, policy) && (
        <p role="status">
          Complete the current weight declaration. Numerical kilograms must
          exceed the open-band threshold.
        </p>
      )}
      <button
        type="button"
        className="text-button"
        onClick={() => model.selectCategory(category.code)}
      >
        Remove {category.name}
      </button>
    </fieldset>
  );
}
function BookingWizard({
  runtime,
  model,
  navigate,
}: {
  runtime: Runtime;
  model: CustomerExperience;
  navigate: (p: string) => void;
}) {
  const draft = useSyncExternalStore(model.subscribe, model.snapshot),
    stage = useSyncExternalStore(
      model.booking.subscribe,
      model.booking.getSnapshot,
    );
  const catalogue = useCatalogue(model),
    policy = useQuery({
      queryKey: ['customer', model.owner, model.epoch, 'policy'],
      queryFn: ({ signal }) => model.repo.weightPolicy(signal),
    });
  const [ready, setReady] = useState(false),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now()),
    [reviewed, setReviewed] = useState<string | null>(null),
    [chosen, setChosen] = useState<{
      context: string;
      start: string;
      generation: number;
    } | null>(null);
  const reads = useRef<AbortController | null>(null);
  useEffect(() => {
    let active = true;
    void model.booking
      .initialize()
      .then(() => {
        if (active) setReady(true);
      })
      .catch((e) => {
        if (active) setError(e);
      });
    return () => {
      active = false;
      reads.current?.abort();
    };
  }, [model]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const selected =
    catalogue.data?.categories.filter(
      (c) => c.active && draft.codes.includes(c.code),
    ) ?? [];
  const input = useMemo(() => {
    if (!policy.data || !catalogue.data || !draft.codes.length) return null;
    const items = draft.codes.map((code) => {
      const c = catalogue.data.categories.find(
        (c) => c.code === code && c.active,
      );
      return c
        ? declarationItem(c, draft.declarations[code], policy.data!)
        : null;
    });
    return items.every((i) => i !== null)
      ? {
          policy_id: policy.data.policy_id,
          policy_revision: policy.data.policy_revision,
          items,
        }
      : null;
  }, [policy.data, catalogue.data, draft.codes, draft.declarations]);
  const quote = useQuery({
    queryKey: ['customer', model.owner, model.epoch, 'quote', input],
    queryFn: async ({ signal }) => {
      const result = await model.repo.quote(input!, signal);
      if (
        result.minimum_amount_minor !== policy.data?.minimum_amount_minor ||
        result.maximum_amount_minor !== policy.data?.maximum_amount_minor
      )
        throw new ApiError(200, 'protocol');
      return result;
    },
    enabled:
      !!input && stage === 'idle' && !policy.isFetching && !policy.isError,
    retry: false,
  });
  const client = useQueryClient();
  useEffect(() => {
    if (quote.error instanceof ApiError && quote.error.status === 409) {
      setReviewed(null);
      void client.invalidateQueries({
        queryKey: ['customer', model.owner, model.epoch, 'policy'],
      });
    }
  }, [quote.error, client, model]);
  const availability = serviceState(
    draft.context ?? undefined,
    draft.address ?? undefined,
    now,
  );
  const slots = useQuery({
    queryKey: [
      'customer',
      model.owner,
      model.epoch,
      'slots',
      draft.context?.serviceability_context_id,
      draft.address?.version,
    ],
    queryFn: ({ signal }) =>
      model.repo.slots(draft.context!.serviceability_context_id, signal),
    enabled: availability === 'SERVICEABLE' && stage === 'idle',
    retry: false,
  });
  const slot =
    slots.data?.serviceability_context_id ===
      draft.context?.serviceability_context_id &&
    !slots.isError &&
    !slots.isFetching
      ? slots.data?.slots.find(
          (s) =>
            s.slot_start === chosen?.start &&
            s.generation === chosen.generation &&
            chosen.context === draft.context?.serviceability_context_id &&
            slotSelectable(s, now),
        )
      : undefined;
  const quoteReady =
    !!input &&
    !!quote.data &&
    !quote.isError &&
    !quote.isFetching &&
    !policy.isError &&
    !policy.isFetching &&
    quote.data.confirmation.policy_revision === policy.data?.policy_revision &&
    quote.data.confirmation.policy_id === policy.data?.policy_id;
  const locked = stage !== 'idle';
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      if (e instanceof BoundBooking) {
        navigate(`/account/collections/${e.requestId}`);
        return;
      }
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    if (!draft.address) return;
    const a = draft.address;
    const c = await model.command(
      `serviceability:${a.address_id}:${a.version}`,
      { id: a.address_id, version: a.version },
      () => runtime.api.check(a),
    );
    if (!model.current()) return;
    model.checkContext(c);
    setChosen(null);
  }
  return (
    <>
      <div className="panel-heading">
        <div>
          <h2>Review your collection</h2>
          <p>
            Review your items, address and backend price before reserving
            capacity.
          </p>
        </div>
        <button
          className="text-button"
          onClick={() => navigate('/account/catalogue')}
        >
          Choose collection items
        </button>
      </div>
      {error !== undefined && <ErrorView error={error} />}
      <section className="product-panel">
        <h3>Pickup address</h3>
        <p>{draft.address?.address ?? 'No address selected.'}</p>
        <button
          className="button secondary small"
          disabled={locked || busy}
          onClick={() => navigate('/account/addresses')}
        >
          Choose saved address
        </button>
        {draft.address && (
          <div className="actions">
            <button
              disabled={busy || locked}
              onClick={() => void action(check)}
            >
              Check pickup availability
            </button>
            {draft.context && availability === 'PENDING' && (
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    reads.current?.abort();
                    reads.current = new AbortController();
                    model.checkContext(
                      await runtime.api.readCheck(
                        draft.context!,
                        draft.address!,
                        reads.current.signal,
                      ),
                    );
                  })
                }
              >
                Read latest availability
              </button>
            )}
          </div>
        )}
        <p role="status">
          {availability === 'SERVICEABLE'
            ? 'Address serviceable. No slot is reserved yet.'
            : availability === 'UNSERVICEABLE'
              ? 'This address is currently unserviceable.'
              : availability === 'PENDING'
                ? 'Address check pending.'
                : availability === 'TECHNICAL_FAILURE'
                  ? 'Address check could not be completed.'
                  : availability === 'expired'
                    ? 'Address check expired. Check again.'
                    : 'Choose and check your current address.'}
        </p>
      </section>
      {catalogue.isError && (
        <ErrorView
          error={catalogue.error}
          retry={() => void catalogue.refetch()}
        />
      )}
      <section className="product-panel">
        <h3>Items and declarations</h3>
        {policy.isPending && <p role="status">Loading current weight bands…</p>}
        {policy.isError && (
          <ErrorView error={policy.error} retry={() => void policy.refetch()} />
        )}
        <fieldset disabled={locked || busy}>
          {policy.data &&
            selected.map((category) => (
              <ItemDeclarationForm
                model={model}
                category={category}
                policy={policy.data}
                key={category.code}
              />
            ))}
        </fieldset>
        {!selected.length && (
          <p>Select at least one active collection category.</p>
        )}
      </section>
      <section className="product-panel">
        <h3>Backend quotation</h3>
        {quote.isFetching && input && (
          <p role="status">Getting the current collection price…</p>
        )}
        {quote.isError && (
          <ErrorView error={quote.error} retry={() => void quote.refetch()} />
        )}
        <button
          disabled={locked || !input || quote.isFetching}
          onClick={() => {
            setReviewed(null);
            void policy.refetch();
            void quote.refetch();
          }}
        >
          Refresh quotation
        </button>
        {quoteReady ? (
          <>
            <p className="price">
              {moneyLabel(quote.data!.total_amount_minor, quote.data!.currency)}
            </p>
            <p>
              {quote.data!.total_weight_grams} g ·{' '}
              {quote.data!.total_volume_ml === null
                ? 'Complete volume declarations'
                : `${quote.data!.total_volume_ml} ml`}
            </p>
            <label className="checkbox">
              <input
                type="checkbox"
                disabled={locked}
                checked={
                  reviewed === quote.data!.confirmation.quote_fingerprint
                }
                onChange={(e) =>
                  setReviewed(
                    e.target.checked
                      ? quote.data!.confirmation.quote_fingerprint
                      : null,
                  )
                }
              />
              I have reviewed this current backend price.
            </label>
            {!quote.data!.live_customer_holds_available && (
              <p>
                Complete occupied volume for every selected category before a
                hold.
              </p>
            )}
          </>
        ) : (
          !input && (
            <p>Complete current weight declarations to request a quotation.</p>
          )
        )}
      </section>
      <section className="product-panel">
        <h3>Projected collection options</h3>
        <p>
          Options are backend projections, not a certified route, assigned rider
          or guaranteed collection time.
        </p>
        <button
          disabled={
            locked || availability !== 'SERVICEABLE' || slots.isFetching
          }
          onClick={() => {
            setChosen(null);
            void slots.refetch();
          }}
        >
          Refresh collection options
        </button>
        {slots.isError && <ErrorView error={slots.error} />}
        <div className="slot-options">
          {availability === 'SERVICEABLE' &&
            !slots.isError &&
            !slots.isFetching &&
            slots.data?.slots.map((s) => (
              <label className="slot-option" key={s.slot_start}>
                <input
                  type="radio"
                  name="slot"
                  disabled={locked || !slotSelectable(s, now)}
                  checked={!!slot && slot.slot_start === s.slot_start}
                  onChange={() =>
                    setChosen({
                      context: draft.context!.serviceability_context_id,
                      start: s.slot_start,
                      generation: s.generation,
                    })
                  }
                />
                <span>
                  {slotLabel(s)}
                  <small>
                    {s.status} · {s.remaining_bookings} projected allowances
                  </small>
                </span>
              </label>
            ))}
        </div>
      </section>
      {stage === 'restart' ? (
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            void action(async () => {
              const id = await model.booking.recoverRestart();
              if (id) navigate(`/account/collections/${id}`);
            })
          }
        >
          Recover previous booking
        </button>
      ) : stage === 'complete' ? (
        <button
          className="button"
          onClick={() => {
            model.booking.startNext();
            navigate('/account/catalogue');
          }}
        >
          Start another collection
        </button>
      ) : (
        <button
          className="button"
          disabled={
            busy ||
            !ready ||
            (stage === 'idle' &&
              (!slot ||
                !quoteReady ||
                reviewed !== quote.data?.confirmation.quote_fingerprint ||
                !quote.data?.live_customer_holds_available))
          }
          onClick={() =>
            void action(async () => {
              const result = await model.booking.submit(
                stage === 'idle'
                  ? {
                      context: draft.context!,
                      availability: slots.data!,
                      slot: slot!,
                      items: quote.data!.items,
                      quote: quote.data!,
                    }
                  : undefined,
              );
              await client.invalidateQueries({
                queryKey: ['customer', model.owner, model.epoch],
              });
              if (model.current())
                navigate(`/account/collections/${result.request_id}`);
            })
          }
        >
          {busy
            ? 'Preparing collection…'
            : stage === 'idle'
              ? 'Reserve capacity and create booking'
              : 'Retry identical prepared booking'}
        </button>
      )}
      <p role="status">
        {stage === 'uncertainBooking' || stage === 'uncertainHold'
          ? 'The outcome is unconfirmed. Your exact command is retained; do not create another booking.'
          : `Preparation: ${stage}`}
      </p>
      <p className="fine">
        A booking awaiting payment is not a paid fulfilment confirmation.
      </p>
    </>
  );
}
function Bookings({
  model,
  navigate,
  bookings = false,
  compact = false,
}: {
  model: CustomerExperience;
  navigate: (p: string) => void;
  bookings?: boolean;
  compact?: boolean;
}) {
  const [view, setView] = useState<'active' | 'history'>('active'),
    client = useQueryClient();
  const key = ['customer', model.owner, model.epoch, 'collections', view];
  const q = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      model.repo.collections(view, pageParam, signal),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  useEffect(() => {
    if (q.isFetchNextPageError && isExpiredCursor(q.error))
      void client.resetQueries({
        queryKey: ['customer', model.owner, model.epoch, 'collections', view],
        exact: true,
      });
  }, [q.isFetchNextPageError, q.error, client, model, view]);
  const items = [
    ...new Map(
      (q.data?.pages.flatMap((p) => p.items) ?? []).map((i) => [
        i.request_id,
        i,
      ]),
    ).values(),
  ];
  return (
    <section>
      <div className="panel-heading">
        {!compact && <h2>{bookings ? 'Bookings' : 'Activity'}</h2>}
        <button onClick={() => void q.refetch()}>
          Refresh {bookings ? 'bookings' : 'activity'}
        </button>
      </div>
      {!compact && (
        <div className="segmented" role="tablist" aria-label="Collection view">
          {(['active', 'history'] as const).map((v) => (
            <button
              role="tab"
              aria-selected={v === view}
              key={v}
              onClick={() => setView(v)}
            >
              {v === 'active' ? 'Active collections' : 'History'}
            </button>
          ))}
        </div>
      )}
      {q.isFetching && !q.isFetchingNextPage ? (
        <p role="status">Loading collections…</p>
      ) : q.isError ? (
        <ErrorView
          error={q.error}
          retry={() =>
            void (q.isFetchNextPageError ? q.fetchNextPage() : q.refetch())
          }
        />
      ) : (
        <>
          {items.slice(0, compact ? 1 : items.length).map((item) => (
            <article
              className="product-panel collection-card"
              key={item.request_id}
            >
              <p className="eyebrow">{item.status.replaceAll('_', ' ')}</p>
              <h3>{item.title}</h3>
              <p>{item.slot.label}</p>
              <p>{item.address_summary}</p>
              <p>Journey: {item.journey_status.replaceAll('_', ' ')}</p>
              {item.refund_status && <p>{refundLabels[item.refund_status]}</p>}
              <button
                className="text-button"
                onClick={() =>
                  navigate(`/account/collections/${item.request_id}`)
                }
              >
                View collection →
              </button>
            </article>
          ))}
          {q.isSuccess && !items.length && (
            <p className="empty">
              No{' '}
              {view === 'active' ? 'active collections' : 'collection history'}{' '}
              yet.
            </p>
          )}
          {q.hasNextPage && !compact && (
            <button
              disabled={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
            >
              Load more collections
            </button>
          )}
        </>
      )}
    </section>
  );
}
function Detail({ model, id }: { model: CustomerExperience; id: string }) {
  const client = useQueryClient(),
    key = ['customer', model.owner, model.epoch, 'detail', id];
  const q = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => model.repo.detail(id, signal),
  });
  return (
    <>
      <div className="panel-heading">
        <h2>Collection details</h2>
        <button
          onClick={() =>
            void client.invalidateQueries({
              queryKey: ['customer', model.owner, model.epoch],
            })
          }
        >
          Refresh pickup details
        </button>
      </div>
      {q.isPending || q.isFetching ? (
        <p role="status">Reading this collection…</p>
      ) : q.isError ? (
        <ErrorView error={q.error} retry={() => void q.refetch()} />
      ) : (
        <DetailContent
          key={id}
          model={model}
          detail={q.data}
          refresh={async () => {
            await client.invalidateQueries({
              queryKey: ['customer', model.owner, model.epoch],
            });
          }}
        />
      )}
    </>
  );
}
function DetailContent({
  model,
  detail,
  refresh,
}: {
  model: CustomerExperience;
  detail: CollectionDetail;
  refresh: () => Promise<void>;
}) {
  const client = useQueryClient();
  const [error, setError] = useState<unknown>(),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [verifying, setVerifying] = useState(false);
  const confirmation = useRef<HTMLHeadingElement>(null),
    life = useRef(new AbortController());
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState !== 'visible') life.current.abort();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      life.current.abort();
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
  useEffect(() => {
    if (confirm) confirmation.current?.focus();
  }, [confirm]);
  const key = [
    'customer',
    model.owner,
    model.epoch,
    'payment',
    detail.request_id,
  ];
  const p = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => model.repo.payment(detail.request_id, signal),
    initialData: detail.payment,
    staleTime: 0,
  });
  const refunds = useQuery({
    queryKey: [
      'customer',
      model.owner,
      model.epoch,
      'refunds',
      detail.request_id,
    ],
    queryFn: ({ signal }) => model.repo.refunds(detail.request_id, signal),
    initialData: { refunds: detail.refunds },
    enabled: detail.status === 'CANCELLED' || detail.refunds.length > 0,
  });
  async function verify() {
    if (verifying) return;
    setVerifying(true);
    setError(undefined);
    try {
      await verifyPayment(
        (signal) => model.repo.payment(detail.request_id, signal),
        life.current.signal,
        () => document.visibilityState === 'visible',
        (value) => client.setQueryData(key, value),
        { attempts: 6, intervalMs: model.options.memoryRecovery ? 5 : 5000 },
      );
    } catch (e) {
      if (!life.current.signal.aborted) setError(e);
    } finally {
      setVerifying(false);
    }
  }
  async function pay(resume = false) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    if (life.current.signal.aborted) life.current = new AbortController();
    try {
      const value = await (resume
        ? model.payment(detail.request_id).resumeExplicitly(life.current.signal)
        : model.payment(detail.request_id).start(life.current.signal));
      if (model.current()) {
        client.setQueryData(key, value);
        await verify();
        await refresh();
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await model.command(
        `cancel:${detail.request_id}`,
        { id: detail.request_id },
        () => model.repo.cancel(detail.request_id, detail.cancellation),
      );
      if (r.status !== 'CANCELLED') throw new ApiError(200, 'protocol');
      setConfirm(false);
      await refresh();
    } catch (e) {
      setError(e);
      if (e instanceof ApiError && [403, 404, 409].includes(e.status))
        await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="product-panel">
        <p className="eyebrow">{detail.status.replaceAll('_', ' ')}</p>
        <h3>{detail.title}</h3>
        <p>{detail.slot.label}</p>
        <p>{detail.address.text}</p>
        <p>
          Collection total:{' '}
          {moneyLabel(detail.quote.amount_minor, detail.quote.currency)}
        </p>
        <ul>
          {detail.items.map((i, index) => (
            <li key={`${i.category_code}:${index}`}>
              <strong>{i.display_name}</strong>
              {i.declared_quantity !== null && (
                <> · quantity {i.declared_quantity}</>
              )}
              {i.declared_weight_grams !== null && (
                <> · {i.declared_weight_grams} g</>
              )}
              {i.declared_volume_ml != null && (
                <> · {i.declared_volume_ml / 1000} L occupied</>
              )}{' '}
              · {moneyLabel(i.quoted_line_amount_minor, detail.quote.currency)}
            </li>
          ))}
        </ul>
      </section>
      <section className="product-panel">
        <h3>Journey of your sacred items</h3>
        <ol className="journey-timeline">
          {detail.journey.milestones.map((m) => (
            <li key={m.code}>
              <strong>{m.label}</strong>
              <span>
                {m.state === 'COMPLETE'
                  ? 'Completed'
                  : m.state === 'CURRENT'
                    ? 'Current step'
                    : 'Upcoming'}
                {m.occurred_at
                  ? ` · ${new Date(m.occurred_at).toLocaleString()}`
                  : ''}
              </span>
              {m.detail && <p>{m.detail}</p>}
              {m.image && <ProductMedia model={model} media={m.image} />}
            </li>
          ))}
        </ol>
        {detail.journey.receiving_point && (
          <div>
            <h4>Authorized receiving point</h4>
            <p>{detail.journey.receiving_point.name}</p>
            <p>{detail.journey.receiving_point.authority_label}</p>
            <p>{detail.journey.receiving_point.address_summary}</p>
            <ProductMedia
              model={model}
              media={detail.journey.receiving_point.image}
            />
          </div>
        )}
        {detail.journey.handover.state === 'VALIDATED' && (
          <p role="status">
            Handover validated by Tirodhan. Further processing is shown only
            when confirmed by the service.
          </p>
        )}
      </section>
      <section className="product-panel">
        <h3>Payment</h3>
        {p.isError ? (
          <ErrorView error={p.error} retry={() => void p.refetch()} />
        ) : p.isFetching ? (
          <p role="status">Reading authoritative payment…</p>
        ) : (
          <>
            <p className="price">
              {moneyLabel(p.data.amount_minor, p.data.currency)}
            </p>
            <p role="status">{paymentLabel(p.data.status)}</p>
            <p>
              {p.data.action === 'WAIT'
                ? 'Tirodhan is verifying the existing attempt. Do not start another payment.'
                : p.data.action === 'UNAVAILABLE'
                  ? 'No checkout action is currently available.'
                  : 'Secure checkout uses the backend-prepared order and amount.'}
            </p>
            {['START', 'RESUME'].includes(p.data.action) && (
              <button
                className="button"
                disabled={
                  busy || verifying || !model.options.checkout?.available()
                }
                onClick={() =>
                  void pay(
                    p.data.action === 'RESUME' ||
                      p.data.action_reason === 'CHECKOUT_READY',
                  )
                }
              >
                {p.data.action === 'RESUME' ||
                p.data.action_reason === 'CHECKOUT_READY'
                  ? 'Resume secure payment'
                  : 'Continue to secure payment'}
              </button>
            )}
            {!model.options.checkout?.available() && (
              <p>
                Provider checkout is implemented but awaits approved web
                checkout activation.
              </p>
            )}
          </>
        )}
        <p>
          Closing checkout, returning from your bank or a browser callback does
          not confirm payment.
        </p>
        <div className="actions">
          <button
            disabled={busy}
            onClick={() => {
              if (life.current.signal.aborted)
                life.current = new AbortController();
              void p.refetch();
            }}
          >
            Refresh payment status
          </button>
          <button
            disabled={busy || verifying}
            onClick={() => {
              if (life.current.signal.aborted)
                life.current = new AbortController();
              void verify();
            }}
          >
            {verifying
              ? 'Checking with Tirodhan…'
              : 'Verify payment with Tirodhan'}
          </button>
        </div>
      </section>
      {(detail.status === 'CANCELLED' || detail.refunds.length > 0) && (
        <section className="product-panel">
          <h3>Refund</h3>
          {refunds.isError ? (
            <ErrorView error={refunds.error} />
          ) : refunds.data.refunds.length ? (
            refunds.data.refunds.map((r) => (
              <div key={r.refund_id}>
                <p>{moneyLabel(r.amount_minor, r.currency)}</p>
                <p role="status">{refundLabels[r.status]}</p>
                <p>
                  {r.completed_at
                    ? `Completed ${new Date(r.completed_at).toLocaleString()}`
                    : `Initiated ${new Date(r.initiated_at).toLocaleString()}`}
                </p>
              </div>
            ))
          ) : (
            <p>
              Cancellation does not confirm a completed refund. Eligibility and
              progress are being checked.
            </p>
          )}
          <button onClick={() => void refunds.refetch()}>
            Refresh refund status
          </button>
        </section>
      )}
      {error !== undefined && <ErrorView error={error} />}
      <section className="product-panel">
        <h3>Cancellation</h3>
        {detail.cancellation.allowed &&
        model.capabilities.has('cancellationCompensation') ? (
          <button className="button secondary" onClick={() => setConfirm(true)}>
            Cancel pickup
          </button>
        ) : (
          <p>
            {detail.cancellation.reason === 'PLANNING_STARTED' ||
            detail.cancellation.reason === 'PLANNING_CUTOFF_REACHED'
              ? 'This pickup can no longer be cancelled because planning has started.'
              : !model.capabilities.has('cancellationCompensation')
                ? 'Cancellation awaits the verified financial-compensation capability.'
                : 'Cancellation is not available for this pickup.'}
          </p>
        )}
        {confirm && (
          <section className="notice" aria-label="Cancellation confirmation">
            <h4 ref={confirmation} tabIndex={-1}>
              Cancel this pickup?
            </h4>
            <p>{detail.slot.label}</p>
            <p>{detail.address.text}</p>
            <p>
              {detail.cancellation.refund_expectation === 'FULL_PAYMENT'
                ? `Tirodhan will initiate any required refund of ${moneyLabel(detail.payment.amount_minor, detail.payment.currency)} after cancellation. Refund completion is separate.`
                : detail.cancellation.refund_expectation === 'REVIEW_REQUIRED'
                  ? 'Refund eligibility requires review. Cancellation does not confirm refund.'
                  : 'No completed payment is available to refund.'}
            </p>
            <button
              className="button"
              disabled={busy}
              onClick={() => void cancel()}
            >
              {model.unresolved(`cancel:${detail.request_id}`)
                ? 'Retry same cancellation'
                : 'Confirm cancellation'}
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Keep pickup / check current state
            </button>
          </section>
        )}
      </section>
    </>
  );
}
function AccountFeature({
  model,
  section,
}: {
  model: CustomerExperience;
  section: string;
}) {
  const [saved, setSaved] = useState(false);
  const client = useQueryClient(),
    key = ['customer', model.owner, model.epoch, section];
  const q = useQuery<
    CustomerProfile | CustomerPreferences | FavouriteCategories | null
  >({
    queryKey: key,
    queryFn: async ({ signal }) =>
      section === 'profile'
        ? model.repo.profile(signal)
        : section === 'preferences'
          ? model.repo.preferences(signal)
          : section === 'favourites'
            ? model.repo.favourites(signal)
            : Promise.resolve(null),
  });
  const catalogue = useCatalogue(model);
  return (
    <section className="product-panel">
      <h2>
        {section === 'profile'
          ? 'Your profile'
          : section === 'preferences'
            ? 'Language & updates'
            : section === 'favourites'
              ? 'Favourite collection items'
              : 'Share feedback'}
      </h2>
      {q.isFetching ? (
        <p role="status">Reading account information…</p>
      ) : q.isError ? (
        <ErrorView error={q.error} retry={() => void q.refetch()} />
      ) : null}
      <AccountForm
        key={q.data && 'version' in q.data ? q.data.version : section}
        model={model}
        section={section}
        value={q.isError || q.isFetching ? null : (q.data ?? null)}
        catalogue={catalogue.data}
        disabled={
          section === 'feedback'
            ? saved || !model.capabilities.has('feedback')
            : q.isError || !q.data || q.isFetching
        }
        onDone={() => {
          setSaved(true);
          void client.invalidateQueries({ queryKey: key });
        }}
      />
      {saved && (
        <p role="status">
          {section === 'feedback'
            ? 'Feedback received.'
            : 'Account information saved.'}
        </p>
      )}
    </section>
  );
}
function AccountForm({
  model,
  section,
  value,
  catalogue,
  disabled,
  onDone,
}: {
  model: CustomerExperience;
  section: string;
  value: CustomerProfile | CustomerPreferences | FavouriteCategories | null;
  catalogue?: Catalogue;
  disabled: boolean;
  onDone: () => void;
}) {
  const scope = `account:${section}`,
    retained = model.submitted(scope) as Record<string, unknown> | null;
  const profile = value as CustomerProfile | null,
    prefs = value as CustomerPreferences | null,
    fav = value as FavouriteCategories | null;
  const [name, setName] = useState(
      String(retained?.display_name ?? profile?.display_name ?? ''),
    ),
    [email, setEmail] = useState(
      String(retained?.email ?? profile?.email ?? ''),
    ),
    [language, setLanguage] = useState(
      String(retained?.language ?? prefs?.language ?? 'en-IN'),
    ),
    [updates, setUpdates] = useState(
      Boolean(
        retained?.collection_notifications ??
        prefs?.collection_notifications ??
        false,
      ),
    ),
    [codes, setCodes] = useState<string[]>(
      (retained?.category_codes as string[] | undefined) ??
        fav?.category_codes ??
        [],
    ),
    [message, setMessage] = useState(String(retained?.message ?? '')),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const identity = useRef(
    String(retained?.client_request_id ?? crypto.randomUUID()),
  );
  const locked = model.unresolved(scope);
  async function save() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const base = {
        client_request_id: identity.current,
        expected_version: Number(
          retained?.expected_version ?? value?.version ?? 0,
        ),
      };
      if (section === 'profile')
        await model.command(
          scope,
          {
            ...base,
            display_name: name.trim() || null,
            email: email.trim() || null,
          },
          () =>
            model.repo.updateProfile({
              ...base,
              display_name: name.trim() || null,
              email: email.trim() || null,
            }),
        );
      else if (section === 'preferences')
        await model.command(
          scope,
          { ...base, language, collection_notifications: updates },
          () =>
            model.repo.updatePreferences({
              ...base,
              language: language as 'en-IN' | 'hi-IN',
              collection_notifications: updates,
            }),
        );
      else if (section === 'favourites')
        await model.command(scope, { ...base, category_codes: codes }, () =>
          model.repo.updateFavourites({ ...base, category_codes: codes }),
        );
      else {
        if (message.trim().length < 5) throw new ApiError(422, 'http');
        await model.command(
          scope,
          { client_request_id: identity.current, message: message.trim() },
          () =>
            model.repo.feedback({
              client_request_id: identity.current,
              message: message.trim(),
            }),
        );
      }
      identity.current = crypto.randomUUID();
      onDone();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={disabled || busy || locked}>
        {section === 'profile' ? (
          <>
            <p>
              {profile?.phone_display ??
                'Verified phone information is unavailable.'}
            </p>
            <label>
              Name (optional)
              <input
                maxLength={100}
                value={name}
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Email (optional)
              <input
                type="email"
                maxLength={254}
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          </>
        ) : section === 'preferences' ? (
          <>
            <p>
              Preferred language applies to service messages. Full app
              translations await approved content.
            </p>
            <label>
              Service language
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="en-IN">English (India)</option>
                <option value="hi-IN">Hindi (India)</option>
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={updates}
                onChange={(e) => setUpdates(e.target.checked)}
              />
              Collection notifications
            </label>
          </>
        ) : section === 'favourites' ? (
          <>
            {catalogue?.categories
              .filter((c) => c.active)
              .map((c) => (
                <label className="checkbox" key={c.code}>
                  <input
                    type="checkbox"
                    checked={codes.includes(c.code)}
                    onChange={() =>
                      setCodes(
                        codes.includes(c.code)
                          ? codes.filter((v) => v !== c.code)
                          : [...codes, c.code],
                      )
                    }
                  />
                  {c.name}
                </label>
              ))}
          </>
        ) : (
          <>
            <p>
              Please leave out credentials and sensitive household information.
            </p>
            <label>
              Feedback message
              <textarea
                minLength={5}
                maxLength={2000}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
          </>
        )}
      </fieldset>
      {error !== undefined && <ErrorView error={error} />}
      <button
        className="button"
        disabled={disabled || busy || (section === 'favourites' && !catalogue)}
        type="submit"
      >
        {locked
          ? 'Retry identical save'
          : section === 'feedback'
            ? 'Send feedback'
            : `Save ${section}`}
      </button>
      {locked && (
        <p className="fine">
          This exact submitted command is retained. Its outcome must be resolved
          before replacing it.
        </p>
      )}
    </form>
  );
}
function PaymentMethods({ model }: { model: CustomerExperience }) {
  const q = useQuery({
    queryKey: ['customer', model.owner, model.epoch, 'paymentMethods'],
    queryFn: ({ signal }) => model.repo.paymentMethods(signal),
  });
  return (
    <section className="product-panel">
      <h2>Payment methods</h2>
      <p>
        Options are confirmed in secure checkout. Tirodhan does not store card
        credentials.
      </p>
      {q.isError ? (
        <ErrorView error={q.error} retry={() => void q.refetch()} />
      ) : q.isPending ? (
        <p role="status">Loading methods…</p>
      ) : q.data.methods.length ? (
        q.data.methods.map((m) => (
          <div key={m.code}>
            <h3>{m.label}</h3>
            <p>{m.description}</p>
          </div>
        ))
      ) : (
        <p>No payment methods are available.</p>
      )}
    </section>
  );
}
function Information({
  model,
  slug,
}: {
  model: CustomerExperience;
  slug: string;
}) {
  const q = useQuery({
    queryKey: ['customer', model.owner, model.epoch, 'content', slug],
    queryFn: ({ signal }) => model.repo.content(slug, signal),
  });
  return (
    <section className="product-panel">
      <h2>
        {q.isSuccess
          ? q.data.title
          : slug === 'help'
            ? 'Help & Support'
            : slug === 'about'
              ? 'About Tirodhan'
              : slug === 'terms'
                ? 'Service terms'
                : 'Privacy policy'}
      </h2>
      {q.isError ? (
        <ErrorView error={q.error} retry={() => void q.refetch()} />
      ) : q.isPending ? (
        <p role="status">Loading approved information…</p>
      ) : (
        q.data.paragraphs.map((p, i) => <p key={i}>{p}</p>)
      )}
    </section>
  );
}
function Notifications({
  model,
  navigate,
}: {
  model: CustomerExperience;
  navigate: (path: string) => void;
}) {
  const client = useQueryClient(),
    key = ['customer', model.owner, model.epoch, 'notifications'];
  const q = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      model.repo.notifications(pageParam, signal),
    getNextPageParam: (p) => p.next_cursor ?? undefined,
  });
  const [registrationState, setRegistrationState] = useState('Not registered');
  const [permission, setPermission] = useState(() =>
      typeof Notification === 'undefined'
        ? 'Unavailable'
        : Notification.permission,
    ),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.isFetchNextPageError && isExpiredCursor(q.error))
      void client.resetQueries({
        queryKey: ['customer', model.owner, model.epoch, 'notifications'],
        exact: true,
      });
  }, [q.isFetchNextPageError, q.error, client, model]);
  const entries = [
    ...new Map(
      (q.data?.pages.flatMap((p) => p.items) ?? []).map((e) => [e.event_id, e]),
    ).values(),
  ];
  async function enable() {
    setBusy(true);
    setError(undefined);
    try {
      if (
        !model.capabilities.has('push') ||
        !model.options.push?.available ||
        !model.options.vapidKey ||
        typeof Notification === 'undefined' ||
        !navigator.serviceWorker
      )
        throw new ApiError(0, 'backendPending');
      const worker = await navigator.serviceWorker.register(
        '/customer-notifications.js',
        { scope: '/account/' },
      );
      setPermission(
        await model.notifications.enable(
          worker,
          Notification,
          new AbortController().signal,
        ),
      );
      setRegistrationState(
        Notification.permission === 'granted'
          ? 'Registered for collection signals'
          : 'Permission not granted',
      );
    } catch (e) {
      setError(e);
      setRegistrationState('Registration could not be confirmed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="product-panel">
        <h2>Notifications</h2>
        <p>
          Browser permission: {permission}. In-app history remains available
          independently of browser permission.
        </p>
        <p>
          Registration:{' '}
          {!model.options.push?.available
            ? 'Awaiting approved browser subscription service'
            : registrationState}
        </p>
        <button
          disabled={busy}
          className="button secondary"
          onClick={() => void enable()}
        >
          Enable browser notifications
        </button>
        <p className="fine">
          Web Push registration is gated until its browser subscription contract
          and deployment are approved. Android/APNs tokens are never reused in
          the browser.
        </p>
        {error !== undefined && <ErrorView error={error} />}
        <button
          className="text-button"
          onClick={() => navigate('/account/preferences')}
        >
          Manage update preferences
        </button>
      </section>
      <section className="product-panel">
        <h3>Collection updates</h3>
        <button onClick={() => void q.refetch()}>Refresh notifications</button>
        {q.isFetching && !q.isFetchingNextPage ? (
          <p role="status">Loading collection updates…</p>
        ) : q.isError ? (
          <ErrorView error={q.error} retry={() => void q.refetch()} />
        ) : (
          <>
            {entries.map((e) => (
              <article className="notification-entry" key={e.event_id}>
                <h4>{e.title}</h4>
                <p>{e.body}</p>
                <p>{new Date(e.created_at).toLocaleString()}</p>
                <button
                  onClick={() =>
                    navigate(`/account/collections/${e.request_id}`)
                  }
                >
                  Open collection
                </button>
              </article>
            ))}
            {!entries.length && <p>No collection updates yet.</p>}
            {q.hasNextPage && (
              <button
                disabled={q.isFetchingNextPage}
                onClick={() => void q.fetchNextPage()}
              >
                Load more updates
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}
