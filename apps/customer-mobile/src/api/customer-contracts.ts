// PROPOSED customer-facing projections. These are not current backend response fields.
export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}
export interface PrincipalDto {
  user_id: string;
  roles: string[];
}
export interface MediaDto {
  url: string;
  thumbnail_url: string | null;
  width: number;
  height: number;
  alt_text: string;
  blurhash: string | null;
  expires_at: string | null;
}
export interface CatalogueDto {
  version: string;
  groups: {
    group_code: string;
    display_name: string;
    display_order: number;
    active: boolean;
  }[];
  categories: {
    category_code: string;
    group_code: string;
    display_name: string;
    description: string;
    display_order: number;
    active: boolean;
    image: MediaDto;
    thumbnail: MediaDto;
    handling_hints: string | null;
    input: { quantity: 'NONE' | 'OPTIONAL'; weight_grams: 'NONE' | 'OPTIONAL' };
  }[];
  quick_categories: {
    category_code: string;
    label: string;
    display_order: number;
  }[];
  artwork: {
    hero: MediaDto | null;
    home: MediaDto | null;
    rickshaw: MediaDto | null;
    receiving_point: MediaDto | null;
  };
}
export interface RecommendationDto {
  recommendations: {
    category_code: string;
    rank: number;
    reason: 'PREVIOUS_COLLECTION';
  }[];
}
export interface SlotsDto {
  serviceability_context_id: string;
  expires_at: string;
  slots: {
    slot_id: string;
    start: string;
    end: string;
    label: string;
    availability: 'AVAILABLE' | 'FULL';
  }[];
}
export type CollectionStatus =
  | 'PENDING_PAYMENT'
  | 'ACCEPTED'
  | 'PRE_PLANNING'
  | 'PLANNED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'EXPIRED';
export type CancellationReason =
  | 'PLANNING_CUTOFF_REACHED'
  | 'PLANNING_STARTED'
  | 'NOT_ACCEPTED'
  | 'ALREADY_CANCELLED'
  | 'NOT_ELIGIBLE';
export interface CancellationCapability {
  allowed: boolean;
  cutoff_at: string | null;
  reason: CancellationReason | null;
  refund_expectation: 'NONE' | 'FULL_PAYMENT' | 'REVIEW_REQUIRED';
}
export interface CollectionSummary {
  request_id: string;
  status: CollectionStatus;
  title: string;
  slot: { start: string; end: string; label: string };
  address_summary: string;
  category_codes: string[];
  image: MediaDto | null;
  journey_status:
    'BOOKED' | 'COLLECTED' | 'RECEIVED' | 'HANDOVER_VALIDATED' | 'NOT_STARTED';
  refund_status: RefundStatus | null;
  created_at: string;
  updated_at: string;
}
export interface Money {
  amount_minor: number;
  currency: string;
}
export interface CheckoutParameters extends Money {
  request_id: string;
  payment_attempt_id: string;
  provider: 'RAZORPAY';
  public_key_id: string;
  provider_order_id: string;
  merchant_display_name: string;
  expires_at: string;
}
export interface PaymentRead extends Money {
  payment_id: string;
  request_id: string;
  status:
    | 'PENDING'
    | 'PROCESSING'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CONFIRMING'
    | 'CANCELLED'
    | 'EXPIRED';
  retry_allowed: boolean;
  expires_at: string | null;
  succeeded_at: string | null;
  current_attempt: {
    payment_attempt_id: string;
    status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CONFIRMING';
  } | null;
}
export type RefundStatus =
  'INITIATED' | 'PROCESSING' | 'COMPLETED' | 'CONFIRMING' | 'FAILED';
export interface RefundRead extends Money {
  refund_id: string;
  status: RefundStatus;
  initiated_at: string;
  completed_at: string | null;
  reason:
    'CUSTOMER_CANCELLATION' | 'SERVICE_UNAVAILABLE' | 'PAYMENT_CORRECTION';
}
export interface JourneyDto {
  request_id: string;
  milestones: {
    code: 'BOOKED' | 'COLLECTED' | 'RECEIVED' | 'HANDOVER_VALIDATED';
    state: 'COMPLETE' | 'CURRENT' | 'UPCOMING';
    occurred_at: string | null;
    label: string;
    detail: string | null;
    image: MediaDto | null;
  }[];
  receiving_point: {
    name: string;
    address_summary: string;
    authority_label: string;
    image: MediaDto | null;
  } | null;
  handover: {
    state: 'NOT_RECORDED' | 'RECORDED' | 'VALIDATED';
    recorded_at: string | null;
    validated_at: string | null;
  };
}
export interface CollectionDetail extends CollectionSummary {
  address: { label: string | null; text: string }; // Immutable booking snapshot, no GPS in customer reads.
  items: {
    category_code: string;
    display_name: string;
    declared_quantity: number | null;
    declared_weight_grams: number | null;
    quoted_line_amount_minor: number;
    image: MediaDto | null;
  }[];
  quote: Money;
  payment: PaymentRead;
  cancellation: CancellationCapability;
  journey: JourneyDto;
  refunds: RefundRead[];
  cancelled_at: string | null;
  completed_at: string | null;
}
export interface PushRegistration {
  client_device_id: string;
  platform: 'ANDROID' | 'IOS';
  token_provider: 'FCM' | 'APNS';
  token: string;
}
export interface PushRegistrationResult {
  client_device_id: string;
  registered_at: string;
}
export interface CustomerPushPayload {
  schema_version: 1;
  event_id: string;
  target: 'COLLECTION';
  request_id: string;
}
export interface NotificationEntry {
  event_id: string;
  title: string;
  body: string;
  created_at: string;
  target: 'COLLECTION';
  request_id: string;
}
export interface CustomerProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  phone_display: string;
  version: number;
}
export interface CustomerPreferences {
  language: 'en-IN' | 'hi-IN';
  collection_notifications: boolean;
  version: number;
}
export interface CustomerContent {
  slug: string;
  title: string;
  paragraphs: string[];
  updated_at: string;
}
export interface FavouriteCategories {
  category_codes: string[];
  version: number;
}
export interface PaymentMethods {
  methods: { code: string; label: string; description: string }[];
}
