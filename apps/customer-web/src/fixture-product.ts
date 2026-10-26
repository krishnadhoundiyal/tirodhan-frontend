// Complete synthetic backend for the browser fixture. This module is build-excluded.
import type {
  CatalogueDto,
  CollectionDetail,
  PaymentRead,
  RefundRead,
} from './parity/api/customer-contracts';
import type {
  CollectionCreate,
  CollectionResponse,
  PaymentAttempt,
} from './parity/api/contracts';
import type { HoldSlot, SlotHold } from './parity/api/slot-contracts';
import type {
  WeightPolicy,
  QuoteInput,
  WeightQuote,
} from './parity/api/weight-contracts';
import type { Context } from './api/contracts';
import { milliUnits } from './parity/api/weight-contracts';
import type { CheckoutPort } from './platform/checkout';
export function productFixture(owner: string) {
  const now = () => new Date().toISOString(),
    future = (ms = 600000) => new Date(Date.now() + ms).toISOString();
  const policy: WeightPolicy = {
    policy_id: 'c0ffee00-0000-4000-8000-000000000030',
    policy_revision: 1,
    first_band_upper_grams: 2000,
    numerical_threshold_grams: 10000,
    first_band_label: 'Light',
    middle_band_label: 'Standard',
    open_band_label: 'Larger collection',
    display_unit: 'kg',
    minimum_amount_minor: 35000,
    maximum_amount_minor: 35000,
    included_weight_grams: 0,
    saturation_weight_grams: 10000,
    curvature: '1',
    currency: 'INR',
    active: true,
    confirmation_freshness: 'CURRENT_POLICY_REVISION',
    live_customer_holds_available: true,
    hold_blocker: null,
  };
  const image = {
    url: 'https://customer-fixture.invalid/illustration',
    thumbnail_url: null,
    width: 300,
    height: 180,
    alt_text: 'Illustrative lotus for a development collection category',
    blurhash: null,
    expires_at: null,
  };
  const groups = [
    ['floral', 'Floral & Organic'],
    ['objects', 'Sacred Objects'],
    ['paper', 'Texts & Paper'],
    ['fabrics', 'Vastra & Accessories'],
  ];
  const labels = [
    ['flowers', 'floral', 'Used Flowers & Garlands'],
    ['havan', 'floral', 'Havan & Puja Remnants'],
    ['leaves', 'floral', 'Sacred Leaves & Plant Material'],
    ['prasad', 'floral', 'Prasad & Organic Offerings'],
    ['idols', 'objects', 'Broken / Retired Idols & Sacred Figures'],
    ['frames', 'objects', 'Frames & Sacred Pictures'],
    ['yantras', 'objects', 'Yantras & Ritual Objects'],
    ['decor', 'objects', 'Temple Decoration Material'],
    ['books', 'paper', 'Old Holy Books & Sacred Paper'],
    ['mantras', 'paper', 'Mantras & Papers'],
    ['calendars', 'paper', 'Calendars & Sacred Print Material'],
    ['pages', 'paper', 'Damaged Books & Pages'],
    ['vastra', 'fabrics', 'Idol Clothes & Sacred Fabrics'],
    ['cloth', 'fabrics', 'Used Vastra'],
    ['ornaments', 'fabrics', 'Sacred Ornaments & Accessories'],
    ['covers', 'fabrics', 'Altar Cloth & Covers'],
  ];
  const catalogue: CatalogueDto = {
    version: 'customer-fixture-catalogue',
    groups: groups.map(([group_code, display_name], i) => ({
      group_code: group_code!,
      display_name: display_name!,
      display_order: i,
      active: true,
    })),
    categories: labels.map(([category_code, group_code, display_name], i) => ({
      category_code: category_code!,
      group_code: group_code!,
      display_name: display_name!,
      description: 'Development collection guide; not live eligibility.',
      display_order: i,
      active: true,
      image,
      thumbnail: image,
      handling_hints: 'Keep packed items ready for respectful collection.',
      input: { quantity: 'OPTIONAL', weight_grams: 'OPTIONAL' },
    })),
    quick_categories: labels.slice(0, 8).map(([category_code, , label], i) => ({
      category_code: category_code!,
      label: label!,
      display_order: i,
    })),
    artwork: {
      hero: image,
      home: image,
      rickshaw: image,
      receiving_point: image,
    },
  };
  const records = new Map<string, CollectionDetail>(),
    responses = new Map<
      string,
      { fingerprint: string; value: unknown; status: number }
    >(),
    holds = new Map<string, { hold: SlotHold; body: HoldSlot }>();
  const attempts = new Map<
    string,
    { requestId: string; attempt: PaymentAttempt }
  >();
  let lastRequest: string | null = null;
  let callbackOnly = false;
  let scenario = 'NORMAL';
  const basePayment = (id: string, amount = 35000): PaymentRead => ({
    payment_id: crypto.randomUUID(),
    request_id: id,
    amount_minor: amount,
    currency: 'INR',
    status: 'PENDING',
    action: 'START',
    action_reason: 'NEW_PAYMENT',
    verification_pending: false,
    checkout_ready_until: null,
    retry_allowed: true,
    expires_at: future(),
    succeeded_at: null,
    current_attempt: null,
  });
  function collection(
    body: CollectionCreate,
    id = crypto.randomUUID(),
  ): CollectionDetail {
    const p = basePayment(id);
    return {
      request_id: id,
      status: 'PENDING_PAYMENT',
      title: 'Sacred collection',
      slot: {
        start: body.slot_start,
        end: body.slot_end,
        label: new Date(body.slot_start).toLocaleString('en-IN'),
      },
      address_summary: 'Fictional saved household',
      category_codes: body.items.map((i) => i.item_category_code),
      image: null,
      journey_status: 'NOT_STARTED',
      refund_status: null,
      created_at: now(),
      updated_at: now(),
      address: {
        label: 'Sample home',
        text: 'Fictional booking address snapshot',
      },
      items: body.items.map((i) => ({
        category_code: i.item_category_code,
        display_name:
          catalogue.categories.find(
            (c) => c.category_code === i.item_category_code,
          )?.display_name ?? i.item_category_code,
        declared_quantity: i.declared_quantity ?? null,
        declared_weight_grams: i.declared_weight_grams ?? null,
        declared_volume_ml: i.declared_volume_ml ?? null,
        weight_band: i.weight_band,
        weight_kg: i.weight_kg,
        quoted_line_amount_minor: 0,
        image: null,
      })),
      quote: { amount_minor: 35000, currency: 'INR' },
      payment: p,
      cancellation: {
        allowed: false,
        cutoff_at: future(),
        reason: 'NOT_ACCEPTED',
        refund_expectation: 'NONE',
      },
      journey: {
        request_id: id,
        milestones: [
          'BOOKED',
          'COLLECTED',
          'RECEIVED',
          'HANDOVER_VALIDATED',
        ].map((code) => ({
          code: code as 'BOOKED',
          state: 'UPCOMING',
          occurred_at: null,
          label: code.replaceAll('_', ' '),
          detail: null,
          image: null,
        })),
        receiving_point: null,
        handover: {
          state: 'NOT_RECORDED',
          recorded_at: null,
          validated_at: null,
        },
      },
      refunds: [],
      cancelled_at: null,
      completed_at: null,
    };
  }
  const result = (
    d: CollectionDetail,
    body: CollectionCreate,
  ): CollectionResponse => ({
    request_id: d.request_id,
    client_request_id: body.client_request_id,
    status: d.status,
    quoted_amount_minor: d.quote.amount_minor,
    currency: 'INR',
    payment_expires_at: d.payment.expires_at!,
    payment_id: d.payment.payment_id,
    items: body.items.map((i, index) => ({
      ...i,
      request_item_id: crypto.randomUUID(),
      declared_quantity: i.declared_quantity ?? null,
      declared_weight_grams: i.declared_weight_grams ?? null,
      quoted_line_amount_minor: index === 0 ? 35000 : 0,
      currency: 'INR',
      pricing_rule_version: 'fixture-rule',
    })),
  });
  let profile = {
      user_id: owner,
      display_name: 'Development customer',
      email: null as string | null,
      phone_display: 'Fictional verified customer',
      version: 1,
    },
    preferences = {
      language: 'en-IN',
      collection_notifications: false,
      version: 1,
    },
    favourites = { category_codes: [] as string[], version: 1 };
  const sdk: CheckoutPort = {
    available: () => true,
    prepare: async () => {},
    launch: async (p) => {
      lastRequest = p.request_id;
      const d = records.get(p.request_id)!;
      d.payment.action = 'WAIT';
      d.payment.action_reason = 'VERIFICATION_REQUIRED';
      d.payment.verification_pending = true;
      if (!callbackOnly) settle(p.request_id);
    },
    close: () => {},
  };
  function settle(id: string) {
    const d = records.get(id);
    if (!d) return;
    d.payment.status = 'SUCCEEDED';
    d.payment.succeeded_at = now();
    d.payment.action = 'UNAVAILABLE';
    d.payment.action_reason = 'PAYMENT_RECEIVED';
    d.payment.retry_allowed = false;
    d.payment.verification_pending = false;
    d.status = 'ACCEPTED';
    d.journey_status = 'BOOKED';
    d.journey.milestones[0] = {
      ...d.journey.milestones[0]!,
      state: 'COMPLETE',
      occurred_at: now(),
    };
    d.cancellation = {
      allowed: true,
      cutoff_at: future(),
      reason: null,
      refund_expectation: 'FULL_PAYMENT',
    };
  }
  const response = (value: unknown, status = 200) =>
    ({
      status,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify(value),
    }) as Response;
  function quote(input: QuoteInput): WeightQuote {
    if (input.policy_revision !== policy.policy_revision)
      throw new Error('policy-conflict');
    const items = input.items.map((i) => ({
      ...i,
      declared_weight_grams:
        i.weight_band === 'ABOVE_T'
          ? milliUnits(i.weight_kg ?? '')!
          : i.weight_band === 'BELOW_B'
            ? 2000
            : 10000,
    }));
    let hash = 2166136261;
    for (const c of JSON.stringify(input))
      hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
    const volume = items.every((i) => i.declared_volume_ml != null)
      ? items.reduce((s, i) => s + i.declared_volume_ml!, 0)
      : null;
    return {
      items,
      total_weight_grams: items.reduce(
        (s, i) => s + i.declared_weight_grams,
        0,
      ),
      total_volume_ml: volume,
      minimum_amount_minor: 35000,
      maximum_amount_minor: 35000,
      total_amount_minor: 35000,
      currency: 'INR',
      confirmation: {
        policy_id: policy.policy_id,
        policy_revision: policy.policy_revision,
        quote_fingerprint: hash.toString(16).padStart(8, '0').repeat(8),
      },
      confirmation_freshness: 'CURRENT_POLICY_REVISION',
      rounding: 'HALF_UP_MINOR_UNIT',
      live_customer_holds_available: volume !== null,
      hold_blocker:
        volume === null ? 'ITEM_VOLUME_DECLARATIONS_REQUIRED' : null,
    };
  }
  async function handle(
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    contexts: Map<string, Context>,
  ): Promise<Response | null> {
    const url = new URL(String(input)),
      path = url.pathname,
      method = init?.method ?? 'GET';
    if (
      !path.startsWith('/v1/customer/') &&
      !path.startsWith('/v2/customer/') &&
      !path.startsWith('/v1/collection-requests') &&
      !path.startsWith('/v1/payments/') &&
      !path.startsWith('/v1/content/')
    )
      return null;
    if (init?.signal?.aborted) throw new Error('cancelled');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    const key = (new Headers(init?.headers).get('Idempotency-Key') ??
      body.client_command_id ??
      body.client_request_id) as string | undefined;
    const fingerprint = JSON.stringify([path, method, body]),
      old = key ? responses.get(key) : undefined;
    if (method !== 'GET' && old)
      return old.fingerprint === fingerprint
        ? response(old.value, old.status)
        : response({ error: { code: 'VERSION_CONFLICT' } }, 409);
    const saved = (value: unknown, status = 201) => {
      if (key)
        responses.set(key, {
          fingerprint,
          value: structuredClone(value),
          status,
        });
      return response(value, status);
    };
    if (path.endsWith('/collection-catalogue')) return response(catalogue);
    if (path.endsWith('/weight-pricing-policy')) return response(policy);
    if (path.endsWith('/collection-quotes')) {
      if (body.policy_revision !== policy.policy_revision)
        return response(
          { detail: 'WEIGHT_POLICY_CHANGED_REVIEW_DECLARATIONS' },
          409,
        );
      return response(quote(body));
    }
    if (path.endsWith('/slot-availability')) {
      const c = contexts.get(
        url.searchParams.get('serviceability_context_id') ?? '',
      );
      if (
        !c ||
        c.status !== 'SERVICEABLE' ||
        Date.parse(c.expires_at) <= Date.now()
      )
        return response({}, 404);
      const start = Math.ceil((Date.now() + 86400000) / 1800000) * 1800000;
      return response({
        region_id: 'c0ffee00-0000-4000-8000-000000000040',
        capacity_certified: false,
        allowance_is_estimate: true,
        standard_pickup_seconds: 300,
        standard_discharge_seconds: 120,
        slots: ['AVAILABLE', 'LIMITED', 'FULL', 'UNKNOWN'].map((status, i) => ({
          slot_start: new Date(start + i * 1800000).toISOString(),
          slot_end: new Date(start + (i + 1) * 1800000).toISOString(),
          status,
          remaining_bookings: status === 'FULL' || status === 'UNKNOWN' ? 0 : 2,
          policy_version: 1,
          generation: 1,
          valid_until: future(),
          admission_basis: 'PROJECTED_ALLOWANCE',
          source_version: 1,
          computed_at: now(),
          capacity_certified: false,
        })),
      });
    }
    if (path === '/v2/customer/slot-holds' && method === 'POST') {
      if (scenario === 'HOLD_CONFLICT')
        return response({ error: { code: 'SLOT_UNAVAILABLE' } }, 409);
      const c = contexts.get(body.context_id);
      if (
        !c ||
        c.status !== 'SERVICEABLE' ||
        Date.parse(c.expires_at) <= Date.now()
      )
        return response({}, 409);
      const h: SlotHold = {
        reservation_id: body.client_command_id,
        bound_request_id: null,
        admission_basis: 'PROJECTED_ALLOWANCE',
        bookable: true,
        expires_at: future(1200000),
        book_by: future(600000),
      };
      holds.set(h.reservation_id, { hold: h, body });
      const r = saved(h);
      if (scenario === 'LOST_HOLD') {
        scenario = 'NORMAL';
        throw new Error('lost hold response');
      }
      return r;
    }
    if (path.startsWith('/v2/customer/slot-holds/')) {
      const h = holds.get(path.split('/').at(-1)!);
      return h ? response(h.hold) : response({}, 404);
    }
    if (path === '/v1/collection-requests' && method === 'POST') {
      const h = holds.get(body.capacity_reservation_id);
      if (
        !h ||
        !h.hold.bookable ||
        h.hold.bound_request_id ||
        h.body.context_id !== body.serviceability_context_id ||
        JSON.stringify(h.body.items) !== JSON.stringify(body.items) ||
        JSON.stringify(h.body.confirmed_quote) !==
          JSON.stringify(body.confirmed_quote)
      )
        return response({}, 409);
      const d = collection(body);
      records.set(d.request_id, d);
      lastRequest = d.request_id;
      h.hold.bound_request_id = d.request_id;
      h.hold.bookable = false;
      const r = saved(result(d, body));
      if (scenario === 'LOST_BOOKING') {
        scenario = 'NORMAL';
        throw new Error('lost booking response');
      }
      return r;
    }
    if (path === '/v1/customer/collection-requests') {
      if (url.searchParams.get('cursor') === 'expired')
        return response({ error: { code: 'CURSOR_EXPIRED' } }, 409);
      const terminal = ['COMPLETED', 'CANCELLED', 'EXPIRED'];
      const items = [...records.values()].filter((d) =>
        url.searchParams.get('view') === 'history'
          ? terminal.includes(d.status)
          : !terminal.includes(d.status),
      );
      return response({
        items: items.slice(
          url.searchParams.has('cursor') ? 2 : 0,
          url.searchParams.has('cursor') ? 4 : 2,
        ),
        next_cursor:
          items.length > 2 && !url.searchParams.has('cursor')
            ? 'next-page'
            : null,
      });
    }
    if (path.endsWith('/recommendations/collection-categories'))
      return response({
        recommendations: [...records.values()]
          .filter((d) => d.status === 'COMPLETED')
          .flatMap((d) => d.category_codes)
          .slice(0, 4)
          .map((category_code, rank) => ({
            category_code,
            rank,
            reason: 'PREVIOUS_COLLECTION',
          })),
      });
    const requestId = path.match(/collection-requests\/([a-f\d-]{36})/)?.[1],
      d = requestId ? records.get(requestId) : undefined;
    if (requestId && !d) return response({}, 404);
    if (d && path.endsWith('/payment')) return response(d.payment);
    if (d && path.endsWith('/refunds')) return response({ refunds: d.refunds });
    if (d && path.endsWith('/attempts')) {
      const attemptId = crypto.randomUUID(),
        a: PaymentAttempt = {
          payment_attempt_id: attemptId,
          status: 'PENDING',
          provider: 'RAZORPAY',
          provider_order_id: `order_fixture${attemptId.replaceAll('-', '')}`,
          provider_payment_id: null,
          failure_code: null,
          action: 'START',
          action_reason: 'CHECKOUT_READY',
          checkout_ready_until: future(),
        };
      attempts.set(attemptId, { requestId: d.request_id, attempt: a });
      d.payment.current_attempt = {
        payment_attempt_id: attemptId,
        status: 'PENDING',
      };
      d.payment.action = 'RESUME';
      d.payment.action_reason = 'CHECKOUT_READY';
      d.payment.checkout_ready_until = future();
      const r = saved(a);
      if (scenario === 'LOST_ATTEMPT') {
        scenario = 'NORMAL';
        throw new Error('lost attempt response');
      }
      return r;
    }
    if (path.endsWith('/checkout')) {
      const a = attempts.get(path.split('/').at(-2)!);
      if (!a) return response({}, 404);
      const d = records.get(a.requestId)!;
      return response({
        request_id: a.requestId,
        payment_attempt_id: a.attempt.payment_attempt_id,
        provider: 'RAZORPAY',
        public_key_id: 'rzp_test_fixtureOnly',
        provider_order_id: a.attempt.provider_order_id,
        merchant_display_name: 'Tirodhan development fixture',
        amount_minor: d.quote.amount_minor,
        currency: 'INR',
        expires_at: d.payment.expires_at,
        checkout_ready_until: future(),
      });
    }
    if (d && path.endsWith('/cancel')) {
      if (scenario === 'PLANNING_RACE') {
        d.cancellation.allowed = false;
        d.cancellation.reason = 'PLANNING_STARTED';
        return response({ error: { code: 'PLANNING_STARTED' } }, 409);
      }
      if (!d.cancellation.allowed)
        return response({ error: { code: 'NOT_ELIGIBLE' } }, 409);
      d.status = 'CANCELLED';
      d.cancelled_at = now();
      d.cancellation.allowed = false;
      const r: RefundRead = {
        refund_id: crypto.randomUUID(),
        status: 'INITIATED',
        amount_minor: d.payment.amount_minor,
        currency: 'INR',
        initiated_at: now(),
        completed_at: null,
        reason: 'CUSTOMER_CANCELLATION',
      };
      d.refunds.push(r);
      d.refund_status = 'INITIATED';
      return saved({ request_id: d.request_id, status: 'CANCELLED' }, 200);
    }
    if (d) return response(d);
    if (path.endsWith('/profile')) {
      if (method === 'PUT') {
        if (body.expected_version !== profile.version)
          return response({ error: { code: 'VERSION_CONFLICT' } }, 409);
        profile = {
          ...profile,
          display_name: body.display_name,
          email: body.email,
          version: profile.version + 1,
        };
        return saved(profile, 200);
      }
      return response(profile);
    }
    if (path.endsWith('/preferences')) {
      if (method === 'PUT') {
        if (body.expected_version !== preferences.version)
          return response({}, 409);
        preferences = {
          language: body.language,
          collection_notifications: body.collection_notifications,
          version: preferences.version + 1,
        };
        return saved(preferences, 200);
      }
      return response(preferences);
    }
    if (path.endsWith('/favourite-categories')) {
      if (method === 'PUT') {
        if (body.expected_version !== favourites.version)
          return response({}, 409);
        favourites = {
          category_codes: body.category_codes,
          version: favourites.version + 1,
        };
        return saved(favourites, 200);
      }
      return response(favourites);
    }
    if (path.endsWith('/payment-methods'))
      return response({
        methods: [
          {
            code: 'PROVIDER_CHECKOUT',
            label: 'Secure provider checkout',
            description:
              'Methods are selected in checkout. No card details stored.',
          },
        ],
      });
    if (path.endsWith('/feedback'))
      return saved({ feedback_id: crypto.randomUUID() });
    if (path.endsWith('/notifications'))
      return response({
        items: [...records.values()].map((d) => ({
          event_id: d.request_id,
          title: 'Development collection update',
          body: 'Read the latest authoritative fixture projection.',
          created_at: now(),
          target: 'COLLECTION',
          request_id: d.request_id,
        })),
        next_cursor: null,
      });
    if (path.startsWith('/v1/content/'))
      return response({
        slug: path.split('/').at(-1),
        title: 'Development information — not approved publishing content',
        paragraphs: [
          'This is an isolated fixture. No approved legal or support material is supplied.',
        ],
        updated_at: now(),
      });
    return response({}, 404);
  }
  return {
    handle,
    sdk,
    catalogue,
    policy,
    quote,
    records,
    holds,
    attempts,
    setScenario: (v: string) => {
      scenario = v;
    },
    setCallbackOnly: (v: boolean) => {
      callbackOnly = v;
    },
    settle: () => {
      if (lastRequest) settle(lastRequest);
    },
    completeRefund: () => {
      if (lastRequest) {
        const d = records.get(lastRequest)!;
        for (const r of d.refunds) {
          r.status = 'COMPLETED';
          r.completed_at = now();
        }
        d.refund_status = 'COMPLETED';
      }
    },
    handover: () => {
      if (lastRequest) {
        const d = records.get(lastRequest)!;
        d.status = 'COMPLETED';
        d.completed_at = now();
        d.journey_status = 'HANDOVER_VALIDATED';
        d.journey.milestones = d.journey.milestones.map((m) => ({
          ...m,
          state: 'COMPLETE',
          occurred_at: now(),
        }));
        d.journey.handover = {
          state: 'VALIDATED',
          recorded_at: now(),
          validated_at: now(),
        };
        d.journey.receiving_point = {
          name: 'Fictional receiving point',
          address_summary: 'Development example only',
          authority_label: 'Simulated authority',
          image: null,
        };
      }
    },
    changePolicy: () => {
      policy.policy_revision++;
    },
  };
}
