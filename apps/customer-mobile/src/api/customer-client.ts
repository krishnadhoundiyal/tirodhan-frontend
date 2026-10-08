import type { Transport } from './transport';
import type { CustomerCapability } from './capabilities';
import type {
  CatalogueDto,
  CheckoutParameters,
  CollectionDetail,
  CollectionSummary,
  CustomerContent,
  CustomerPreferences,
  CustomerProfile,
  FavouriteCategories,
  JourneyDto,
  NotificationEntry,
  Page,
  PaymentMethods,
  PaymentRead,
  PrincipalDto,
  PushRegistration,
  PushRegistrationResult,
  RecommendationDto,
  RefundRead,
  SlotsDto,
} from './customer-contracts';

export function createCustomerApi(
  transport: Transport,
  requireCapability: (capability: CustomerCapability) => void,
) {
  function read<T>(
    capability: CustomerCapability,
    path: string,
    signal?: AbortSignal,
    publicRead = false,
  ) {
    requireCapability(capability);
    return transport.request<T>(path, { signal, authenticated: !publicRead });
  }
  function cursor(path: string, value: string | null) {
    return `${path}${value ? `&cursor=${encodeURIComponent(value)}` : ''}`;
  }
  return {
    principal: (signal?: AbortSignal) => {
      requireCapability('principal');
      // A rejected live principal invalidates credentials; it must never await its own refresh flight.
      return transport.request<PrincipalDto>('/v1/auth/me', {
        signal,
        refreshOn401: false,
      });
    },
    catalogue: (signal?: AbortSignal) =>
      read<CatalogueDto>(
        'catalogue',
        '/v1/customer/collection-catalogue',
        signal,
      ),
    slots: (id: string, signal?: AbortSignal) =>
      read<SlotsDto>(
        'slots',
        `/v1/customer/pickup-slots?serviceability_context_id=${encodeURIComponent(id)}`,
        signal,
      ),
    collections: (
      view: 'active' | 'history',
      next: string | null = null,
      signal?: AbortSignal,
    ) =>
      read<Page<CollectionSummary>>(
        'collections',
        cursor(`/v1/customer/collection-requests?view=${view}&limit=20`, next),
        signal,
      ),
    detail: (id: string, signal?: AbortSignal) =>
      read<CollectionDetail>(
        'collections',
        `/v1/customer/collection-requests/${encodeURIComponent(id)}`,
        signal,
      ),
    journey: (id: string, signal?: AbortSignal) =>
      read<JourneyDto>(
        'journey',
        `/v1/customer/collection-requests/${encodeURIComponent(id)}/journey`,
        signal,
      ),
    recommendations: (signal?: AbortSignal) =>
      read<RecommendationDto>(
        'recommendations',
        '/v1/customer/recommendations/collection-categories',
        signal,
      ),
    payment: (id: string, signal?: AbortSignal) =>
      read<PaymentRead>(
        'payment',
        `/v1/customer/collection-requests/${encodeURIComponent(id)}/payment`,
        signal,
      ),
    checkout: (id: string, signal?: AbortSignal) =>
      read<CheckoutParameters>(
        'checkout',
        `/v1/customer/payment-attempts/${encodeURIComponent(id)}/checkout`,
        signal,
      ),
    refunds: (id: string, signal?: AbortSignal) =>
      read<{ refunds: RefundRead[] }>(
        'refunds',
        `/v1/customer/collection-requests/${encodeURIComponent(id)}/refunds`,
        signal,
      ),
    notifications: (next: string | null, signal?: AbortSignal) =>
      read<Page<NotificationEntry>>(
        'notifications',
        cursor('/v1/customer/notifications?limit=20', next),
        signal,
      ),
    registerPush: (body: PushRegistration) => {
      requireCapability('push');
      return transport.command<PushRegistrationResult>(
        `/v1/customer/me/push-devices/${encodeURIComponent(body.client_device_id)}`,
        { method: 'PUT', body },
      );
    },
    revokePush: (id: string) => {
      requireCapability('push');
      return transport.command<void>(
        `/v1/customer/me/push-devices/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
    },
    profile: (signal?: AbortSignal) =>
      read<CustomerProfile>('profile', '/v1/customer/me/profile', signal),
    updateProfile: (body: {
      client_request_id: string;
      expected_version: number;
      display_name: string | null;
      email: string | null;
    }) => {
      requireCapability('profile');
      return transport.command<CustomerProfile>('/v1/customer/me/profile', {
        method: 'PUT',
        body,
      });
    },
    preferences: (signal?: AbortSignal) =>
      read<CustomerPreferences>(
        'preferences',
        '/v1/customer/me/preferences',
        signal,
      ),
    updatePreferences: (body: {
      client_request_id: string;
      expected_version: number;
      language: 'en-IN' | 'hi-IN';
      collection_notifications: boolean;
    }) => {
      requireCapability('preferences');
      return transport.command<CustomerPreferences>(
        '/v1/customer/me/preferences',
        { method: 'PUT', body },
      );
    },
    content: (slug: string, signal?: AbortSignal) =>
      read<CustomerContent>(
        'content',
        `/v1/content/${encodeURIComponent(slug)}`,
        signal,
        true,
      ),
    favourites: (signal?: AbortSignal) =>
      read<FavouriteCategories>(
        'favourites',
        '/v1/customer/me/favourite-categories',
        signal,
      ),
    updateFavourites: (body: {
      client_request_id: string;
      expected_version: number;
      category_codes: string[];
    }) => {
      requireCapability('favourites');
      return transport.command<FavouriteCategories>(
        '/v1/customer/me/favourite-categories',
        { method: 'PUT', body },
      );
    },
    paymentMethods: (signal?: AbortSignal) =>
      read<PaymentMethods>(
        'paymentMethods',
        '/v1/customer/payment-methods',
        signal,
      ),
    feedback: (body: { client_request_id: string; message: string }) => {
      requireCapability('feedback');
      return transport.command<{ feedback_id: string }>(
        '/v1/customer/feedback',
        { method: 'POST', body },
      );
    },
  };
}
export type CustomerApi = ReturnType<typeof createCustomerApi>;
