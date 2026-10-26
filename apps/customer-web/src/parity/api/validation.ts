import { ApiError } from './errors';
import type {
  CatalogueDto,
  CollectionDetail,
  CollectionSummary,
  PaymentRead,
  CheckoutParameters,
  RefundRead,
  MediaDto,
} from './customer-contracts';
import { uuid as validUUID } from './slot-contracts';
type Decode<T> = (v: unknown) => T;
const bad = (): never => {
  throw new ApiError(200, 'protocol');
};
export const row = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : bad();
export const str = (v: unknown, max = 2000) =>
  typeof v === 'string' && v.length <= max ? v : bad();
export const nonempty = (v: unknown) => (str(v).length ? str(v) : bad());
export const id = (v: unknown) => (validUUID(v) ? v : bad());
const num = (v: unknown, min = 0) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min ? v : bad();
const bool = (v: unknown) => (typeof v === 'boolean' ? v : bad());
const time = (v: unknown) =>
  typeof v === 'string' &&
  /T.+(?:Z|[+-]\d\d:\d\d)$/.test(v) &&
  Number.isFinite(Date.parse(v))
    ? v
    : bad();
const nullable =
  <T>(parse: Decode<T>) =>
  (v: unknown) =>
    v === null ? null : parse(v);
const list =
  <T>(parse: Decode<T>, max = 1000) =>
  (v: unknown) =>
    Array.isArray(v) && v.length <= max ? v.map((item) => parse(item)) : bad();
function choice<T extends string>(...values: T[]): Decode<T> {
  return (v) => (values.includes(v as T) ? (v as T) : bad());
}
function shape<T>(v: unknown, schema: { [K in keyof T]: Decode<T[K]> }): T {
  const r = row(v);
  return Object.fromEntries(
    Object.entries(schema).map(([key, parse]) => [
      key,
      (parse as Decode<unknown>)(r[key]),
    ]),
  ) as T;
}
export const safeMedia = (v: unknown): MediaDto => {
  const m = shape<MediaDto>(v, {
    url: nonempty,
    thumbnail_url: nullable(nonempty),
    width: (v) => num(v, 1),
    height: (v) => num(v, 1),
    alt_text: nonempty,
    blurhash: nullable(str),
    expires_at: nullable(time),
  });
  for (const value of [m.url, m.thumbnail_url])
    if (value) {
      const u = new URL(value);
      if (
        u.protocol !== 'https:' ||
        u.username ||
        u.password ||
        u.searchParams.getAll('sp').some((p) => p !== 'r')
      )
        bad();
    }
  return m;
};
const money = { amount_minor: num, currency: choice('INR') };
const paymentStatus = choice(
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'CONFIRMING',
  'CANCELLED',
  'EXPIRED',
);
const action = choice('START', 'RESUME', 'WAIT', 'UNAVAILABLE');
const actionReason = choice(
  'NEW_PAYMENT',
  'CHECKOUT_READY',
  'VERIFICATION_REQUIRED',
  'PREPARATION_IN_PROGRESS',
  'RECONCILIATION_REQUIRED',
  'BOOKING_INELIGIBLE',
  'ACCOUNT_MISMATCH',
  'PAYMENT_RECEIVED',
  'SUPERSEDED_ATTEMPT',
);
const attemptRef = (v: unknown) => {
  const r = row(v);
  return {
    payment_attempt_id: id(r.payment_attempt_id),
    status: choice(
      'PENDING',
      'PROCESSING',
      'SUCCEEDED',
      'FAILED',
      'CONFIRMING',
    )(r.status),
  };
};
export function payment(v: unknown): PaymentRead {
  const p = shape<PaymentRead>(v, {
    ...money,
    payment_id: id,
    request_id: id,
    status: paymentStatus,
    retry_allowed: bool,
    action,
    action_reason: actionReason,
    verification_pending: bool,
    checkout_ready_until: nullable(time),
    expires_at: nullable(time),
    succeeded_at: nullable(time),
    current_attempt: nullable(attemptRef),
  });
  if (
    (p.status === 'SUCCEEDED' &&
      (p.action !== 'UNAVAILABLE' || !p.succeeded_at)) ||
    (p.action === 'RESUME' && (!p.current_attempt || !p.checkout_ready_until))
  )
    bad();
  return p;
}
export function checkout(v: unknown): CheckoutParameters {
  const c = shape<CheckoutParameters>(v, {
    ...money,
    request_id: id,
    payment_attempt_id: id,
    provider: choice('RAZORPAY'),
    public_key_id: nonempty,
    provider_order_id: nonempty,
    merchant_display_name: nonempty,
    expires_at: time,
    checkout_ready_until: time,
  });
  if (c.amount_minor < 1) bad();
  return c;
}
export function paymentAttempt(v: unknown) {
  const r = row(v);
  return {
    payment_attempt_id: id(r.payment_attempt_id),
    status: choice(
      'CREATED',
      'PENDING',
      'INITIATION_UNCERTAIN',
      'SUCCEEDED',
      'FAILED',
    )(r.status),
    provider: nonempty(r.provider),
    provider_order_id: nullable(str)(r.provider_order_id),
    provider_payment_id: nullable(str)(r.provider_payment_id),
    failure_code: nullable(str)(r.failure_code),
    action: action(r.action),
    action_reason: actionReason(r.action_reason),
    checkout_ready_until: nullable(time)(r.checkout_ready_until),
  };
}
const refundStatus = choice(
  'INITIATED',
  'PROCESSING',
  'COMPLETED',
  'CONFIRMING',
  'FAILED',
);
export const refund = (v: unknown) =>
  shape<RefundRead>(v, {
    ...money,
    refund_id: id,
    status: refundStatus,
    initiated_at: time,
    completed_at: nullable(time),
    reason: choice(
      'CUSTOMER_CANCELLATION',
      'SERVICE_UNAVAILABLE',
      'PAYMENT_CORRECTION',
    ),
  });
export const catalogue = (v: unknown): CatalogueDto => {
  const r = row(v);
  nonempty(r.version);
  const groups = list((v) => {
    const x = row(v);
    return {
      group_code: nonempty(x.group_code),
      display_name: nonempty(x.display_name),
      display_order: num(x.display_order),
      active: bool(x.active),
    };
  })(r.groups);
  const categories = list((v) => {
    const x = row(v),
      input = row(x.input);
    return {
      category_code: nonempty(x.category_code),
      group_code: nonempty(x.group_code),
      display_name: nonempty(x.display_name),
      description: str(x.description),
      display_order: num(x.display_order),
      active: bool(x.active),
      image: safeMedia(x.image),
      thumbnail: safeMedia(x.thumbnail),
      handling_hints: nullable(str)(x.handling_hints),
      input: {
        quantity: choice('NONE', 'OPTIONAL')(input.quantity),
        weight_grams: choice('NONE', 'OPTIONAL')(input.weight_grams),
      },
    };
  })(r.categories);
  if (
    new Set(groups.map((g) => g.group_code)).size !== groups.length ||
    new Set(categories.map((c) => c.category_code)).size !==
      categories.length ||
    categories.some((c) => !groups.some((g) => g.group_code === c.group_code))
  )
    bad();
  const art = row(r.artwork);
  return {
    version: nonempty(r.version),
    groups,
    categories,
    quick_categories: list((v) => {
      const x = row(v);
      return {
        category_code: nonempty(x.category_code),
        label: nonempty(x.label),
        display_order: num(x.display_order),
      };
    })(r.quick_categories),
    artwork: {
      hero: nullable(safeMedia)(art.hero),
      home: nullable(safeMedia)(art.home),
      rickshaw: nullable(safeMedia)(art.rickshaw),
      receiving_point: nullable(safeMedia)(art.receiving_point),
    },
  };
};
const status = choice(
  'PENDING_PAYMENT',
  'ACCEPTED',
  'PRE_PLANNING',
  'PLANNED',
  'CANCELLED',
  'COMPLETED',
  'EXPIRED',
);
const milestoneCode = choice(
  'BOOKED',
  'COLLECTED',
  'RECEIVED',
  'HANDOVER_VALIDATED',
);
const slot = (v: unknown) => {
  const r = row(v);
  const s = {
    start: time(r.start),
    end: time(r.end),
    label: nonempty(r.label),
  };
  if (Date.parse(s.start) >= Date.parse(s.end)) bad();
  return s;
};
export function summary(v: unknown): CollectionSummary {
  return shape<CollectionSummary>(v, {
    request_id: id,
    status,
    title: nonempty,
    slot,
    address_summary: str,
    category_codes: list(nonempty),
    image: nullable(safeMedia),
    journey_status: choice(
      'BOOKED',
      'COLLECTED',
      'RECEIVED',
      'HANDOVER_VALIDATED',
      'NOT_STARTED',
    ),
    refund_status: nullable(refundStatus),
    created_at: time,
    updated_at: time,
  });
}
export function detail(v: unknown): CollectionDetail {
  const r = row(v),
    a = row(r.address),
    c = row(r.cancellation),
    j = row(r.journey),
    h = row(j.handover);
  const d: CollectionDetail = {
    ...summary(v),
    address: { label: nullable(str)(a.label), text: nonempty(a.text) },
    items: list((v) => {
      const i = row(v);
      return {
        category_code: nonempty(i.category_code),
        display_name: nonempty(i.display_name),
        declared_quantity: nullable(num)(i.declared_quantity),
        declared_weight_grams: nullable(num)(i.declared_weight_grams),
        declared_volume_ml: nullable(num)(i.declared_volume_ml ?? null),
        weight_band: nullable(choice('BELOW_B', 'B_TO_T', 'ABOVE_T'))(
          i.weight_band ?? null,
        ),
        weight_kg: nullable(str)(i.weight_kg ?? null),
        quoted_line_amount_minor: num(i.quoted_line_amount_minor),
        image: nullable(safeMedia)(i.image),
      };
    })(r.items),
    quote: shape(r.quote, money),
    payment: payment(r.payment),
    refunds: list(refund)(r.refunds),
    cancellation: {
      allowed: bool(c.allowed),
      cutoff_at: nullable(time)(c.cutoff_at),
      reason: nullable(
        choice(
          'PLANNING_CUTOFF_REACHED',
          'PLANNING_STARTED',
          'NOT_ACCEPTED',
          'ALREADY_CANCELLED',
          'NOT_ELIGIBLE',
        ),
      )(c.reason),
      refund_expectation: choice(
        'NONE',
        'FULL_PAYMENT',
        'REVIEW_REQUIRED',
      )(c.refund_expectation),
    },
    journey: {
      request_id: id(j.request_id),
      milestones: list((v) => {
        const m = row(v);
        return {
          code: milestoneCode(m.code),
          state: choice('COMPLETE', 'CURRENT', 'UPCOMING')(m.state),
          occurred_at: nullable(time)(m.occurred_at),
          label: nonempty(m.label),
          detail: nullable(str)(m.detail),
          image: nullable(safeMedia)(m.image),
        };
      })(j.milestones),
      receiving_point:
        j.receiving_point === null
          ? null
          : shape(row(j.receiving_point), {
              name: nonempty,
              address_summary: str,
              authority_label: nonempty,
              image: nullable(safeMedia),
            }),
      handover: {
        state: choice('NOT_RECORDED', 'RECORDED', 'VALIDATED')(h.state),
        recorded_at: nullable(time)(h.recorded_at),
        validated_at: nullable(time)(h.validated_at),
      },
    },
    cancelled_at: nullable(time)(r.cancelled_at),
    completed_at: nullable(time)(r.completed_at),
  };
  if (
    d.payment.request_id !== d.request_id ||
    d.journey.request_id !== d.request_id ||
    d.quote.amount_minor !== d.payment.amount_minor ||
    d.quote.currency !== d.payment.currency
  )
    bad();
  return d;
}
const page = <T>(v: unknown, parse: Decode<T>) => {
  const r = row(v);
  return {
    items: list(parse, 100)(r.items),
    next_cursor: nullable((v) => str(v, 2000))(r.next_cursor),
  };
};
export function decodeProduct(path: string, v: unknown): unknown {
  const p = path.split('?')[0]!;
  if (p.endsWith('/collection-catalogue')) return catalogue(v);
  if (p === '/v1/customer/collection-requests') return page(v, summary);
  if (/^\/v1\/customer\/collection-requests\/[^/]+$/.test(p)) {
    const d = detail(v);
    if (d.request_id !== p.split('/').at(-1)) bad();
    return d;
  }
  if (p.endsWith('/payment')) {
    const result = payment(v);
    if (result.request_id !== p.split('/').at(-2)) bad();
    return result;
  }
  if (p.endsWith('/refunds')) return { refunds: list(refund)(row(v).refunds) };
  if (p.endsWith('/checkout')) {
    const c = checkout(v);
    if (c.payment_attempt_id !== p.split('/').at(-2)) bad();
    return c;
  }
  if (p.endsWith('/attempts')) return paymentAttempt(v);
  if (p.endsWith('/recommendations/collection-categories'))
    return {
      recommendations: list((v) => {
        const r = row(v);
        return {
          category_code: nonempty(r.category_code),
          rank: num(r.rank),
          reason: choice('PREVIOUS_COLLECTION')(r.reason),
        };
      })(row(v).recommendations),
    };
  if (p.endsWith('/notifications'))
    return page(v, (v) => {
      const r = row(v);
      return {
        event_id: nonempty(r.event_id),
        title: nonempty(r.title),
        body: str(r.body),
        created_at: time(r.created_at),
        target: choice('COLLECTION')(r.target),
        request_id: id(r.request_id),
      };
    });
  if (p.endsWith('/profile')) {
    const r = row(v);
    return {
      user_id: id(r.user_id),
      display_name: nullable((v) => str(v, 100))(r.display_name),
      email: nullable((v) => str(v, 254))(r.email),
      phone_display: str(r.phone_display),
      version: num(r.version, 1),
    };
  }
  if (p.endsWith('/preferences')) {
    const r = row(v);
    return {
      language: choice('en-IN', 'hi-IN')(r.language),
      collection_notifications: bool(r.collection_notifications),
      version: num(r.version, 1),
    };
  }
  if (p.endsWith('/favourite-categories')) {
    const r = row(v);
    return {
      category_codes: list(nonempty)(r.category_codes),
      version: num(r.version, 1),
    };
  }
  if (p.endsWith('/payment-methods'))
    return {
      methods: list((v) => {
        const r = row(v);
        return {
          code: nonempty(r.code),
          label: nonempty(r.label),
          description: str(r.description),
        };
      })(row(v).methods),
    };
  if (p.endsWith('/feedback')) return { feedback_id: id(row(v).feedback_id) };
  if (p.startsWith('/v1/content/')) {
    const r = row(v);
    if (r.slug !== p.split('/').at(-1)) bad();
    return {
      slug: nonempty(r.slug),
      title: nonempty(r.title),
      paragraphs: list(str)(r.paragraphs),
      updated_at: time(r.updated_at),
    };
  }
  return v; // Address validation lives in the existing CustomerApi; weight/slot parsers validate at call site.
}
