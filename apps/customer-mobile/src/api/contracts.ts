// Hand-mapped from backend main 4994089; backend remains the authority.
export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user_id: string;
}
export interface LoginTokenResponse extends AccessTokenResponse {
  refresh_token: string;
}
export interface Location {
  latitude: number;
  longitude: number;
}
export interface AddressWrite {
  address: string;
  label?: string | null;
  location?: Location | null;
  is_default: boolean;
}
export interface Address extends AddressWrite {
  address_id: string;
  label: string | null;
  location: Location | null;
  status: string;
  version: number;
}
export interface AddressUpdate extends AddressWrite {
  expected_version: number;
}
export type ServiceabilityInput = (
  | { source_address_id: string; address?: never }
  | { address: string; source_address_id?: never }
) & { location?: Location };
export interface ServiceabilityContext {
  serviceability_context_id: string;
  source_address_id: string | null;
  source_address_version: number | null;
  status: string;
  cell_id: string | null;
  failure_code: string | null;
  expires_at: string;
  resolved_at: string | null;
}
export interface CollectionItemInput {
  item_category_code: string;
  declared_quantity?: number;
  declared_weight_grams?: number;
}
export interface CollectionCreate {
  client_request_id: string;
  serviceability_context_id: string;
  slot_start: string;
  slot_end: string;
  items: CollectionItemInput[];
}
export interface CollectionItem {
  request_item_id: string;
  item_category_code: string;
  declared_quantity: number | null;
  declared_weight_grams: number | null;
  quoted_line_amount_minor: number;
  currency: string;
  pricing_rule_version: string | null;
}
export interface CollectionResponse {
  request_id: string;
  client_request_id: string;
  status: string;
  quoted_amount_minor: number;
  currency: string;
  payment_expires_at: string;
  payment_id: string;
  items: CollectionItem[];
}
export interface PaymentAttempt {
  payment_attempt_id: string;
  status: string;
  provider: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  failure_code: string | null;
}
