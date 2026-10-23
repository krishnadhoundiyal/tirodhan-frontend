import {
  milliUnits,
  type WeightPolicy,
  type QuoteInput,
  type WeightQuote,
} from '../../api/weight-contracts';
// Editorial SCREEN_PREVIEW data only. No production policy defaults or price formula.
export const developmentWeightPolicy: WeightPolicy = {
  policy_id: '66666666-6666-4666-8666-666666666666',
  policy_revision: 1,
  first_band_upper_grams: 2000,
  numerical_threshold_grams: 10000,
  first_band_label: 'Small collection',
  middle_band_label: 'Medium collection',
  open_band_label: 'Larger collection',
  display_unit: 'kg',
  minimum_amount_minor: 35000,
  maximum_amount_minor: 35000,
  included_weight_grams: 2000,
  saturation_weight_grams: 50000,
  curvature: '1',
  currency: 'INR',
  active: true,
  confirmation_freshness: 'CURRENT_POLICY_REVISION',
  live_customer_holds_available: true,
  hold_blocker: null,
};
export function developmentQuote(input: QuoteInput): WeightQuote {
  const items = input.items.map((item) => ({
    ...item,
    declared_weight_grams:
      item.weight_band === 'ABOVE_T'
        ? milliUnits(item.weight_kg ?? '')!
        : item.weight_band === 'BELOW_B'
          ? developmentWeightPolicy.first_band_upper_grams
          : developmentWeightPolicy.numerical_threshold_grams,
  }));
  const volume = items.every((item) => item.declared_volume_ml != null)
    ? items.reduce((sum, i) => sum + i.declared_volume_ml!, 0)
    : null;
  // Local fixture identity changes with declarations so editing invalidates price review.
  const text = JSON.stringify(input);
  let hash = 0;
  for (const c of text) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  return {
    items,
    total_weight_grams: items.reduce(
      (sum, i) => sum + i.declared_weight_grams,
      0,
    ),
    total_volume_ml: volume,
    minimum_amount_minor: 35000,
    maximum_amount_minor: 35000,
    total_amount_minor: 35000,
    currency: 'INR',
    confirmation: {
      policy_id: input.policy_id,
      policy_revision: input.policy_revision,
      quote_fingerprint: hash.toString(16).padStart(8, '0').repeat(8),
    },
    confirmation_freshness: 'CURRENT_POLICY_REVISION',
    rounding: 'HALF_UP_MINOR_UNIT',
    live_customer_holds_available: volume !== null,
    hold_blocker: volume === null ? 'ITEM_VOLUME_DECLARATIONS_REQUIRED' : null,
  };
}
