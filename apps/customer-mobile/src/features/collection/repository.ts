import type { CustomerApi } from '../../api/customer-client';
import type {
  Address,
  CollectionCreate,
  CollectionResponse,
  ServiceabilityContext,
} from '../../api/contracts';
import type { PreparedCommand } from '../../api/transport';
import type {
  CancellationCapability,
  CollectionDetail,
  CollectionSummary,
  CustomerContent,
  CustomerPreferences,
  CustomerProfile,
  FavouriteCategories,
  NotificationEntry,
  Page,
  PaymentMethods,
  PaymentRead,
  CheckoutParameters,
  RecommendationDto,
  RefundRead,
  SlotsDto,
} from '../../api/customer-contracts';
import { catalogueFromDto, type Catalogue } from './catalogue';
import type { CustomerCapability } from '../../api/capabilities';
import type { createApi } from '../../api/client';
import { ApiError } from '../../api/errors';
export interface CustomerRepositories {
  source: 'backend' | 'development';
  catalogue(signal?: AbortSignal): Promise<Catalogue>;
  recommendations(signal?: AbortSignal): Promise<RecommendationDto>;
  collections(
    view: 'active' | 'history',
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<Page<CollectionSummary>>;
  detail(id: string, signal?: AbortSignal): Promise<CollectionDetail>;
  payment(id: string, signal?: AbortSignal): Promise<PaymentRead>;
  checkout(id: string, signal?: AbortSignal): Promise<CheckoutParameters>;
  paymentAttempt: ReturnType<typeof createApi>['paymentAttempt'];
  refunds(id: string, signal?: AbortSignal): Promise<{ refunds: RefundRead[] }>;
  slots(id: string, signal?: AbortSignal): Promise<SlotsDto>;
  addresses(signal?: AbortSignal): Promise<Address[]>;
  createAddress: ReturnType<typeof createApi>['createAddress'];
  updateAddress: ReturnType<typeof createApi>['updateAddress'];
  archiveAddress: ReturnType<typeof createApi>['archiveAddress'];
  serviceability(address: Address): PreparedCommand<ServiceabilityContext>;
  readServiceability(
    id: string,
    signal?: AbortSignal,
  ): Promise<ServiceabilityContext>;
  createCollection(body: CollectionCreate): PreparedCommand<CollectionResponse>;
  cancel(
    id: string,
    capability: CancellationCapability,
  ): PreparedCommand<CollectionResponse>;
  profile(signal?: AbortSignal): Promise<CustomerProfile>;
  updateProfile: CustomerApi['updateProfile'];
  preferences(signal?: AbortSignal): Promise<CustomerPreferences>;
  updatePreferences: CustomerApi['updatePreferences'];
  favourites(signal?: AbortSignal): Promise<FavouriteCategories>;
  updateFavourites: CustomerApi['updateFavourites'];
  content(slug: string, signal?: AbortSignal): Promise<CustomerContent>;
  notifications(
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<Page<NotificationEntry>>;
  paymentMethods(signal?: AbortSignal): Promise<PaymentMethods>;
  feedback: CustomerApi['feedback'];
  reset(): void;
}
export function createHttpRepositories(
  customer: CustomerApi,
  existing: ReturnType<typeof createApi>,
  requireCapability: (capability: CustomerCapability) => void,
): CustomerRepositories {
  return {
    source: 'backend',
    catalogue: async (signal) =>
      catalogueFromDto(await customer.catalogue(signal)),
    recommendations: customer.recommendations,
    collections: customer.collections,
    detail: customer.detail,
    payment: customer.payment,
    checkout: customer.checkout,
    paymentAttempt: (id) => {
      requireCapability('payment');
      requireCapability('checkout');
      return existing.paymentAttempt(id);
    },
    refunds: customer.refunds,
    slots: customer.slots,
    addresses: existing.addresses,
    createAddress: existing.createAddress,
    updateAddress: existing.updateAddress,
    archiveAddress: existing.archiveAddress,
    serviceability: (address) =>
      existing.serviceability({ source_address_id: address.address_id }),
    readServiceability: existing.readServiceability,
    createCollection: existing.createCollection,
    cancel: (id, capability) => {
      // Do not expose a financially incomplete cancellation as production-ready.
      requireCapability('cancellationCompensation');
      if (!capability.allowed) throw new ApiError(409, 'http', 'NOT_ELIGIBLE');
      return existing.cancelCollection(id);
    },
    profile: customer.profile,
    updateProfile: customer.updateProfile,
    preferences: customer.preferences,
    updatePreferences: customer.updatePreferences,
    favourites: customer.favourites,
    updateFavourites: customer.updateFavourites,
    content: customer.content,
    notifications: customer.notifications,
    paymentMethods: customer.paymentMethods,
    feedback: customer.feedback,
    reset() {},
  };
}
