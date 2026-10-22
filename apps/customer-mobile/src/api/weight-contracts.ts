import type { CollectionItemInput } from './contracts';
import { ApiError } from './errors';
import { uuid } from './slot-contracts';
export type WeightBand = 'BELOW_B' | 'B_TO_T' | 'ABOVE_T';
export interface QuoteConfirmation {
  policy_id: string;
  policy_revision: number;
  quote_fingerprint: string;
}
export interface WeightPolicy {
  policy_id: string;
  policy_revision: number;
  first_band_upper_grams: number;
  numerical_threshold_grams: number;
  first_band_label: string;
  middle_band_label: string;
  open_band_label: string;
  display_unit: 'kg';
  minimum_amount_minor: number;
  maximum_amount_minor: number;
  included_weight_grams: number;
  saturation_weight_grams: number;
  curvature: string;
  currency: 'INR';
  active: boolean;
  confirmation_freshness: 'CURRENT_POLICY_REVISION';
  live_customer_holds_available: true;
  hold_blocker: null;
}
export interface QuoteInput {
  policy_id: string;
  policy_revision: number;
  items: CollectionItemInput[];
}
export interface WeightQuote {
  items: CollectionItemInput[];
  total_weight_grams: number;
  total_volume_ml: number | null;
  minimum_amount_minor: number;
  maximum_amount_minor: number;
  total_amount_minor: number;
  currency: 'INR';
  confirmation: QuoteConfirmation;
  confirmation_freshness: 'CURRENT_POLICY_REVISION';
  rounding: 'HALF_UP_MINOR_UNIT';
  live_customer_holds_available: boolean;
  hold_blocker: 'ITEM_VOLUME_DECLARATIONS_REQUIRED' | null;
}
export const MAX_LOAD = 2147483647;
export const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export const whole = (v: unknown, min = 1, max = MAX_LOAD): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
export const money = (v: unknown) => whole(v, 0, Number.MAX_SAFE_INTEGER);
// Exact kg->g and litres->ml unit conversion, never rounding or physical inference.
export function milliUnits(value: string): number | null {
  if (value.length > 20 || !/^[0-9]+(?:\.[0-9]{1,3})?$/.test(value))
    return null;
  const [units, fraction = ''] = value.split('.');
  const result = Number(`${units}${fraction.padEnd(3, '0')}`);
  return whole(result) ? result : null;
}
export function validConfirmation(value: unknown): value is QuoteConfirmation {
  return (
    record(value) &&
    uuid(value.policy_id) &&
    whole(value.policy_revision, 1, Number.MAX_SAFE_INTEGER) &&
    typeof value.quote_fingerprint === 'string' &&
    /^[0-9a-f]{64}$/.test(value.quote_fingerprint)
  );
}
export function validItem(
  value: unknown,
  normalized = false,
): value is CollectionItemInput {
  if (
    !record(value) ||
    typeof value.item_category_code !== 'string' ||
    !value.item_category_code.length ||
    value.item_category_code.length > 100 ||
    (value.declared_quantity != null && !whole(value.declared_quantity)) ||
    (value.declared_weight_grams != null &&
      !whole(value.declared_weight_grams)) ||
    (value.declared_volume_ml != null && !whole(value.declared_volume_ml)) ||
    !['BELOW_B', 'B_TO_T', 'ABOVE_T'].includes(String(value.weight_band))
  )
    return false;
  if (value.weight_band === 'ABOVE_T') {
    if (
      typeof value.weight_kg !== 'string' ||
      milliUnits(value.weight_kg) === null
    )
      return false;
  } else if (value.weight_kg != null) return false;
  return !normalized || whole(value.declared_weight_grams);
}
export function parsePolicy(value: unknown): WeightPolicy {
  if (
    !record(value) ||
    !uuid(value.policy_id) ||
    !whole(value.policy_revision, 1, Number.MAX_SAFE_INTEGER) ||
    !whole(value.first_band_upper_grams) ||
    !whole(value.numerical_threshold_grams) ||
    value.first_band_upper_grams >= value.numerical_threshold_grams ||
    !['first_band_label', 'middle_band_label', 'open_band_label'].every(
      (k) =>
        typeof value[k] === 'string' &&
        value[k].length > 0 &&
        value[k].length <= 100,
    ) ||
    !money(value.minimum_amount_minor) ||
    Number(value.minimum_amount_minor) < 100 ||
    !money(value.maximum_amount_minor) ||
    Number(value.maximum_amount_minor) < Number(value.minimum_amount_minor) ||
    !whole(value.included_weight_grams, 0) ||
    !whole(value.saturation_weight_grams) ||
    value.saturation_weight_grams <= value.included_weight_grams ||
    typeof value.curvature !== 'string' ||
    !/^[0-9]+(?:\.[0-9]{1,6})?$/.test(value.curvature) ||
    Number(value.curvature) <= 0 ||
    value.currency !== 'INR' ||
    value.display_unit !== 'kg' ||
    value.active !== true ||
    value.confirmation_freshness !== 'CURRENT_POLICY_REVISION' ||
    value.live_customer_holds_available !== true ||
    value.hold_blocker !== null
  )
    throw new ApiError(200, 'protocol');
  return value as unknown as WeightPolicy;
}
export function parseQuote(value: unknown, input?: QuoteInput): WeightQuote {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    !value.items.length ||
    !value.items.every((v) => validItem(v, true)) ||
    !whole(value.total_weight_grams) ||
    !(value.total_volume_ml === null || whole(value.total_volume_ml)) ||
    !money(value.minimum_amount_minor) ||
    !money(value.maximum_amount_minor) ||
    !money(value.total_amount_minor) ||
    Number(value.total_amount_minor) < Number(value.minimum_amount_minor) ||
    Number(value.total_amount_minor) > Number(value.maximum_amount_minor) ||
    value.currency !== 'INR' ||
    !validConfirmation(value.confirmation) ||
    value.rounding !== 'HALF_UP_MINOR_UNIT' ||
    value.confirmation_freshness !== 'CURRENT_POLICY_REVISION' ||
    typeof value.live_customer_holds_available !== 'boolean'
  )
    throw new ApiError(200, 'protocol');
  const quote = value as unknown as WeightQuote;
  const weight = quote.items.reduce(
    (sum, item) => sum + item.declared_weight_grams!,
    0,
  );
  const volume = quote.items.every((item) => item.declared_volume_ml != null)
    ? quote.items.reduce((sum, item) => sum + item.declared_volume_ml!, 0)
    : null;
  if (
    weight !== quote.total_weight_grams ||
    volume !== quote.total_volume_ml ||
    quote.live_customer_holds_available !== (volume !== null) ||
    quote.hold_blocker !==
      (volume === null ? 'ITEM_VOLUME_DECLARATIONS_REQUIRED' : null) ||
    (input &&
      (quote.confirmation.policy_id !== input.policy_id ||
        quote.confirmation.policy_revision !== input.policy_revision ||
        quote.items.length !== input.items.length ||
        quote.items.some((item, i) => {
          const sent = input.items[i]!;
          return (
            item.item_category_code !== sent.item_category_code ||
            item.weight_band !== sent.weight_band ||
            (item.weight_kg ?? null) !== (sent.weight_kg ?? null) ||
            (item.declared_quantity ?? null) !==
              (sent.declared_quantity ?? null) ||
            (item.declared_volume_ml ?? null) !==
              (sent.declared_volume_ml ?? null) ||
            (sent.declared_weight_grams != null &&
              item.declared_weight_grams !== sent.declared_weight_grams)
          );
        })))
  )
    throw new ApiError(200, 'protocol');
  return quote;
}
