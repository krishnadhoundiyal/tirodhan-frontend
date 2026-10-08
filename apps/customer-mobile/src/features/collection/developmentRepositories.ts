import type {
  Address,
  CollectionResponse,
  ServiceabilityContext,
} from '../../api/contracts';
import type {
  CollectionDetail,
  CollectionStatus,
  CollectionSummary,
  CustomerPreferences,
  CustomerProfile,
  FavouriteCategories,
  PaymentRead,
  RefundStatus,
  SlotsDto,
} from '../../api/customer-contracts';
import { ApiError } from '../../api/errors';
import type { CustomerRepositories } from './repository';
import { developmentCatalogue } from './developmentCatalogue';
import type { PrincipalReader } from '../../session/store';

// No network dependency, credential or fake server response. This implementation is selected only in explicit __DEV__ preview.
export const developmentPrincipalReader: PrincipalReader = {
  async read() {
    return { userId: 'preview-customer', roles: ['CUSTOMER'] };
  },
};
export const developmentAddresses: Address[] = [
  {
    address_id: 'preview-home',
    label: 'Preview Home',
    address: 'Preview pickup location · Green Park, New Delhi',
    location: { latitude: 28.559, longitude: 77.206 },
    status: 'ACTIVE',
    version: 1,
    is_default: true,
  },
  {
    address_id: 'preview-temple',
    label: 'Preview Temple',
    address: 'Preview pickup location · Dwarka, New Delhi',
    location: { latitude: 28.592, longitude: 77.046 },
    status: 'ACTIVE',
    version: 1,
    is_default: false,
  },
];
export function createDevelopmentRepositories(): CustomerRepositories {
  // Fixtures contain JSON DTOs only. This also works on Hermes without structuredClone.
  const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  let addresses: Address[] = [];
  const future = (hours: number) =>
    new Date(Date.now() + hours * 3600000).toISOString();
  const ids = {
    active: '11111111-1111-4111-8111-111111111111',
    collected: '22222222-2222-4222-8222-222222222222',
    race: '33333333-3333-4333-8333-333333333333',
    retry: '44444444-4444-4444-8444-444444444444',
  };
  const create = (
    id: string,
    status: CollectionStatus,
    title: string,
    refundStatus: RefundStatus | null = null,
  ): CollectionDetail => {
    const terminal = ['CANCELLED', 'COMPLETED', 'EXPIRED'].includes(status);
    const complete = status === 'COMPLETED';
    const collected = id === ids.collected || complete;
    const slot = {
      start: future(terminal ? -72 : collected ? -2 : 24),
      end: future(terminal ? -71.5 : collected ? -1.5 : 24.5),
      label: '',
    };
    slot.label = `${new Date(slot.start).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}–${new Date(slot.end).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
    const payment: PaymentRead = {
      payment_id: `payment-${id}`,
      request_id: id,
      amount_minor: 35000,
      currency: 'INR',
      status:
        status === 'PENDING_PAYMENT'
          ? 'PENDING'
          : status === 'EXPIRED'
            ? 'EXPIRED'
            : 'SUCCEEDED',
      retry_allowed: status === 'PENDING_PAYMENT',
      expires_at: status === 'PENDING_PAYMENT' ? future(0.25) : null,
      succeeded_at:
        status === 'PENDING_PAYMENT' || status === 'EXPIRED'
          ? null
          : future(terminal ? -100 : collected ? -4 : -2),
      current_attempt: null,
    };
    return {
      request_id: id,
      status,
      title,
      slot,
      address_summary: 'Preview Green Park · New Delhi',
      category_codes: complete ? ['flowers', 'books'] : ['flowers', 'idols'],
      image: null,
      journey_status: complete
        ? 'HANDOVER_VALIDATED'
        : collected
          ? 'COLLECTED'
          : status === 'CANCELLED' ||
              status === 'EXPIRED' ||
              status === 'PENDING_PAYMENT'
            ? 'NOT_STARTED'
            : 'BOOKED',
      refund_status: refundStatus,
      created_at: future(terminal ? -100 : -2),
      updated_at: future(-0.1),
      address: {
        label: 'Preview Home',
        text: 'Preview pickup location · Green Park, New Delhi',
      },
      items: (complete ? ['flowers', 'books'] : ['flowers', 'idols']).map(
        (code) => ({
          category_code: code,
          display_name: developmentCatalogue.categories.find(
            (category) => category.code === code,
          )!.name,
          declared_quantity: null,
          declared_weight_grams: null,
          quoted_line_amount_minor: 17500,
          image: null,
        }),
      ),
      quote: { amount_minor: 35000, currency: 'INR' },
      payment,
      cancellation: {
        allowed: status === 'ACCEPTED',
        cutoff_at: terminal ? null : future(22),
        reason:
          status === 'ACCEPTED'
            ? null
            : status === 'CANCELLED'
              ? 'ALREADY_CANCELLED'
              : status === 'PLANNED'
                ? 'PLANNING_STARTED'
                : 'NOT_ACCEPTED',
        refund_expectation:
          payment.status === 'SUCCEEDED' ? 'FULL_PAYMENT' : 'NONE',
      },
      journey: {
        request_id: id,
        milestones: [
          {
            code: 'BOOKED',
            state: payment.status === 'SUCCEEDED' ? 'COMPLETE' : 'UPCOMING',
            occurred_at: payment.succeeded_at,
            label: 'Booked',
            detail: null,
            image: null,
          },
          {
            code: 'COLLECTED',
            state: collected
              ? 'COMPLETE'
              : terminal || payment.status !== 'SUCCEEDED'
                ? 'UPCOMING'
                : 'CURRENT',
            occurred_at: collected ? future(complete ? -72 : -1) : null,
            label: 'Collected by Tirodhan',
            detail: 'Human-powered collection',
            image: null,
          },
          {
            code: 'RECEIVED',
            state: complete ? 'COMPLETE' : collected ? 'CURRENT' : 'UPCOMING',
            occurred_at: complete ? future(-70) : null,
            label: 'Authorised receiving point',
            detail:
              complete || collected
                ? 'Preview authorised receiving point'
                : null,
            image: null,
          },
          {
            code: 'HANDOVER_VALIDATED',
            state: complete ? 'COMPLETE' : 'UPCOMING',
            occurred_at: complete ? future(-69) : null,
            label: 'Handover validated',
            detail: null,
            image: null,
          },
        ],
        receiving_point:
          complete || collected
            ? {
                name: 'Preview authorised receiving point',
                address_summary: 'Development destination · New Delhi',
                authority_label: 'Preview authority',
                image: null,
              }
            : null,
        handover: {
          state: complete ? 'VALIDATED' : 'NOT_RECORDED',
          recorded_at: complete ? future(-70) : null,
          validated_at: complete ? future(-69) : null,
        },
      },
      refunds: refundStatus
        ? [
            {
              refund_id: `refund-${id}`,
              amount_minor: 35000,
              currency: 'INR',
              status: refundStatus,
              initiated_at: future(-48),
              completed_at: refundStatus === 'COMPLETED' ? future(-24) : null,
              reason: 'CUSTOMER_CANCELLATION',
            },
          ]
        : [],
      cancelled_at: status === 'CANCELLED' ? future(-48) : null,
      completed_at: complete ? future(-69) : null,
    };
  };
  let details = new Map<string, CollectionDetail>();
  let profile: CustomerProfile;
  let preferences: CustomerPreferences;
  let favourites: FavouriteCategories;
  const contexts = new Map<string, ServiceabilityContext>();
  let contextSequence = 0;
  const reset = () => {
    details = new Map(
      [
        create(ids.active, 'ACCEPTED', 'Collection scheduled'),
        create(ids.collected, 'PLANNED', 'Collected by Tirodhan'),
        create(ids.race, 'ACCEPTED', 'Planning race preview'),
        create(ids.retry, 'ACCEPTED', 'Connection retry preview'),
        create(
          '55555555-5555-4555-8555-555555555555',
          'COMPLETED',
          'Sacred collection completed',
        ),
        ...(
          [
            'INITIATED',
            'PROCESSING',
            'COMPLETED',
            'CONFIRMING',
            'FAILED',
          ] as const
        ).map((status, index) =>
          create(
            `66666666-6666-4666-8666-66666666666${index}`,
            'CANCELLED',
            'Pickup cancelled',
            status,
          ),
        ),
        create(
          '77777777-7777-4777-8777-777777777777',
          'EXPIRED',
          'Payment window expired',
        ),
        create(
          '88888888-8888-4888-8888-888888888888',
          'PENDING_PAYMENT',
          'Payment awaiting confirmation',
        ),
      ].map((item) => [item.request_id, item]),
    );
    profile = {
      user_id: 'preview-customer',
      display_name: 'Development customer',
      email: null,
      phone_display: 'Preview mobile number',
      version: 1,
    };
    preferences = {
      language: 'en-IN',
      collection_notifications: true,
      version: 1,
    };
    favourites = { category_codes: ['flowers'], version: 1 };
    contexts.clear();
    contextSequence = 0;
    addresses = copy(developmentAddresses);
  };
  reset();
  const detail = (id: string) => {
    const record = details.get(id);
    if (!record) throw new ApiError(404);
    return copy(record);
  };
  const command = <T>(run: () => T) => {
    let result: T | undefined;
    let completed = false;
    return {
      execute: async () => {
        if (!completed) {
          result = run();
          completed = true;
        }
        return copy(result as T);
      },
    };
  };
  const existingResponse = (record: CollectionDetail): CollectionResponse => ({
    request_id: record.request_id,
    client_request_id: record.request_id,
    status: record.status,
    quoted_amount_minor: record.quote.amount_minor,
    currency: record.quote.currency,
    payment_expires_at: record.payment.expires_at ?? record.slot.start,
    payment_id: record.payment.payment_id,
    items: record.items.map((item, index) => ({
      request_item_id: `${record.request_id}-${index}`,
      item_category_code: item.category_code,
      declared_quantity: item.declared_quantity,
      declared_weight_grams: item.declared_weight_grams,
      quoted_line_amount_minor: item.quoted_line_amount_minor,
      currency: record.quote.currency,
      pricing_rule_version: 'development',
    })),
  });
  return {
    source: 'development',
    async catalogue() {
      return developmentCatalogue;
    },
    async recommendations() {
      const historicalCodes = new Set(
        [...details.values()]
          .filter((record) => record.status === 'COMPLETED')
          .flatMap((record) => record.category_codes),
      );
      return {
        recommendations: developmentCatalogue.categories
          .filter(
            (category) => category.active && historicalCodes.has(category.code),
          )
          .map((category, index) => ({
            category_code: category.code,
            rank: index + 1,
            reason: 'PREVIOUS_COLLECTION' as const,
          })),
      };
    },
    async collections(view, cursor) {
      const offset = cursor === null ? 0 : Number(cursor);
      if (!Number.isSafeInteger(offset) || offset < 0)
        throw new ApiError(409, 'http', 'CURSOR_EXPIRED');
      const records = [...details.values()]
        .filter(
          (record) =>
            (['CANCELLED', 'COMPLETED', 'EXPIRED'].includes(record.status)
              ? 'history'
              : 'active') === view,
        )
        .sort(
          (a, b) =>
            b.created_at.localeCompare(a.created_at) ||
            b.request_id.localeCompare(a.request_id),
        );
      const summary = ({
        request_id,
        status,
        title,
        slot,
        address_summary,
        category_codes,
        image,
        journey_status,
        refund_status,
        created_at,
        updated_at,
      }: CollectionDetail): CollectionSummary => ({
        request_id,
        status,
        title,
        slot,
        address_summary,
        category_codes,
        image,
        journey_status,
        refund_status,
        created_at,
        updated_at,
      });
      return {
        items: records.slice(offset, offset + 2).map(summary),
        next_cursor: offset + 2 < records.length ? String(offset + 2) : null,
      };
    },
    async detail(id) {
      return detail(id);
    },
    async payment(id) {
      return detail(id).payment;
    },
    async checkout() {
      throw new ApiError(0, 'preview');
    },
    paymentAttempt() {
      return command(() => {
        throw new ApiError(0, 'preview');
      });
    },
    async refunds(id) {
      return { refunds: detail(id).refunds };
    },
    async slots(id): Promise<SlotsDto> {
      const context = contexts.get(id);
      if (!context || Date.parse(context.expires_at) <= Date.now())
        throw new ApiError(409, 'http', 'SERVICEABILITY_EXPIRED');
      const label = (start: string, end: string) =>
        `${new Date(start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · ${new Date(start).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}–${new Date(end).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
      const morningStart = future(24),
        morningEnd = future(24.5),
        fullStart = future(25),
        fullEnd = future(25.5);
      return {
        serviceability_context_id: id,
        expires_at: context.expires_at,
        slots: [
          {
            slot_id: 'preview-morning',
            start: morningStart,
            end: morningEnd,
            label: label(morningStart, morningEnd),
            availability: 'AVAILABLE',
          },
          {
            slot_id: 'preview-full',
            start: fullStart,
            end: fullEnd,
            label: label(fullStart, fullEnd),
            availability: 'FULL',
          },
        ],
      };
    },
    async addresses() {
      return copy(addresses.filter((address) => address.status === 'ACTIVE'));
    },
    createAddress(body) {
      return command(() => {
        const saved: Address = {
          ...body,
          label: body.label ?? null,
          location: body.location ?? null,
          address_id: `preview-address-${addresses.length}`,
          status: 'ACTIVE',
          version: 1,
        };
        if (saved.is_default)
          addresses.forEach((address) => {
            address.is_default = false;
          });
        addresses.push(saved);
        return saved;
      });
    },
    updateAddress(id, body) {
      return command(() => {
        const current = addresses.find((address) => address.address_id === id);
        if (!current) throw new ApiError(404);
        if (current.version !== body.expected_version)
          throw new ApiError(409, 'http', 'VERSION_CONFLICT');
        const saved = {
          ...current,
          ...body,
          label: body.label ?? null,
          location: body.location ?? null,
          version: current.version + 1,
        };
        if (saved.is_default)
          addresses.forEach((address) => {
            address.is_default = false;
          });
        addresses = addresses.map((address) =>
          address.address_id === id ? saved : address,
        );
        return saved;
      });
    },
    archiveAddress(id) {
      return command(() => {
        const current = addresses.find((address) => address.address_id === id);
        if (!current) throw new ApiError(404);
        current.status = 'ARCHIVED';
        current.is_default = false;
        return current;
      });
    },
    serviceability(address) {
      return command(() => {
        const context: ServiceabilityContext = {
          serviceability_context_id: `preview-context-${address.address_id}-${address.version}-${++contextSequence}`,
          source_address_id: address.address_id,
          source_address_version: address.version,
          status: 'SERVICEABLE',
          cell_id: null,
          failure_code: null,
          expires_at: future(0.25),
          resolved_at: new Date().toISOString(),
        };
        contexts.set(context.serviceability_context_id, context);
        return context;
      });
    },
    async readServiceability(id) {
      const context = contexts.get(id);
      if (!context) throw new ApiError(404);
      return copy(context);
    },
    createCollection(body) {
      return command(() => {
        const context = contexts.get(body.serviceability_context_id);
        if (!context || Date.parse(context.expires_at) <= Date.now())
          throw new ApiError(409, 'http', 'SERVICEABILITY_EXPIRED');
        const record = create(
          body.client_request_id,
          'PENDING_PAYMENT',
          'Preview booking · payment pending',
        );
        record.slot = {
          start: body.slot_start,
          end: body.slot_end,
          label: 'Selected development pickup time',
        };
        record.category_codes = body.items.map(
          (item) => item.item_category_code,
        );
        record.items = body.items.map((item, index) => ({
          category_code: item.item_category_code,
          display_name:
            developmentCatalogue.categories.find(
              (category) => category.code === item.item_category_code,
            )?.name ?? item.item_category_code,
          declared_quantity: item.declared_quantity ?? null,
          declared_weight_grams: item.declared_weight_grams ?? null,
          quoted_line_amount_minor: index === 0 ? 35000 : 0,
          image: null,
        }));
        // A fixed editorial quote demonstrates layout only; it is never a production pricing formula.
        details.set(record.request_id, record);
        return existingResponse(record);
      });
    },
    cancel(id, capability) {
      if (!capability.allowed) throw new ApiError(409, 'http', 'NOT_ELIGIBLE');
      let tried = false;
      return command(() => {
        if (id === ids.race) {
          const current = details.get(id)!;
          current.cancellation = {
            ...current.cancellation,
            allowed: false,
            reason: 'PLANNING_STARTED',
          };
          current.status = 'PRE_PLANNING';
          throw new ApiError(409, 'http', 'PLANNING_STARTED');
        }
        if (id === ids.retry && !tried) {
          tried = true;
          throw new ApiError(0, 'network');
        }
        const current = details.get(id)!;
        if (current.status !== 'CANCELLED' && !current.cancellation.allowed)
          throw new ApiError(409, 'http', 'PLANNING_STARTED');
        current.status = 'CANCELLED';
        current.cancelled_at = new Date().toISOString();
        current.cancellation = {
          ...current.cancellation,
          allowed: false,
          reason: 'ALREADY_CANCELLED',
        };
        if (!current.refunds.length && current.payment.status === 'SUCCEEDED') {
          current.refunds = [
            {
              refund_id: `refund-${id}`,
              amount_minor: current.payment.amount_minor,
              currency: current.payment.currency,
              status: 'INITIATED',
              reason: 'CUSTOMER_CANCELLATION',
              initiated_at: new Date().toISOString(),
              completed_at: null,
            },
          ];
          current.refund_status = 'INITIATED';
        }
        return existingResponse(current);
      });
    },
    async profile() {
      return copy(profile);
    },
    updateProfile(body) {
      return command(() => {
        if (body.expected_version !== profile.version) throw new ApiError(409);
        profile = {
          ...profile,
          display_name: body.display_name,
          email: body.email,
          version: profile.version + 1,
        };
        return profile;
      });
    },
    async preferences() {
      return copy(preferences);
    },
    updatePreferences(body) {
      return command(() => {
        if (body.expected_version !== preferences.version)
          throw new ApiError(409);
        preferences = {
          language: body.language,
          collection_notifications: body.collection_notifications,
          version: preferences.version + 1,
        };
        return preferences;
      });
    },
    async favourites() {
      return copy(favourites);
    },
    updateFavourites(body) {
      return command(() => {
        if (body.expected_version !== favourites.version)
          throw new ApiError(409);
        favourites = {
          category_codes: body.category_codes,
          version: favourites.version + 1,
        };
        return favourites;
      });
    },
    async content(slug) {
      return {
        slug,
        title:
          slug === 'help'
            ? 'Help & Support'
            : slug === 'about'
              ? 'About Tirodhan'
              : slug === 'terms'
                ? 'Terms & Conditions'
                : 'Privacy Policy',
        paragraphs: [
          'Development content preview. Approved service, support and legal text must be supplied by Tirodhan before release.',
        ],
        updated_at: new Date().toISOString(),
      };
    },
    async notifications() {
      return {
        items: [
          {
            event_id: 'preview-event',
            title: 'Your pickup journey',
            body: 'Development notification signal. Open to refresh the current collection.',
            created_at: new Date().toISOString(),
            target: 'COLLECTION',
            request_id: ids.active,
          },
        ],
        next_cursor: null,
      };
    },
    async paymentMethods() {
      return {
        methods: [
          {
            code: 'preview-checkout',
            label: 'Secure provider checkout',
            description:
              'Development preview. No card or payment credential is stored in Tirodhan.',
          },
        ],
      };
    },
    feedback() {
      return command(() => ({ feedback_id: 'preview-feedback' }));
    },
    reset,
  };
}
