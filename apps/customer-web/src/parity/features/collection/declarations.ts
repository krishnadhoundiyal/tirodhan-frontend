import type { CollectionItemInput } from '../../api/contracts';
import {
  milliUnits,
  whole,
  type WeightBand,
  type WeightPolicy,
} from '../../api/weight-contracts';
import type { Category } from './catalogue';
export interface ItemDeclaration {
  quantity?: number;
  weightGrams?: number; // Historical selections only; never used to infer new band/volume.
  weightBand?: WeightBand;
  weightKg?: string;
  volumeLitres?: string;
  quantityText?: string;
  policyId?: string;
  policyRevision?: number;
}
export function declarationItem(
  category: Category,
  value: ItemDeclaration | undefined,
  policy: WeightPolicy,
): CollectionItemInput | null {
  if (
    !value ||
    value.policyId !== policy.policy_id ||
    value.policyRevision !== policy.policy_revision ||
    !value.weightBand
  )
    return null;
  const volume = milliUnits(value.volumeLitres ?? '');
  const quantity =
    value.quantityText === undefined
      ? value.quantity
      : value.quantityText === ''
        ? undefined
        : /^[1-9]\d*$/.test(value.quantityText)
          ? Number(value.quantityText)
          : NaN;
  if (quantity !== undefined && !whole(quantity)) return null;
  if (
    value.weightBand === 'ABOVE_T' &&
    (milliUnits(value.weightKg ?? '') ?? 0) <= policy.numerical_threshold_grams
  )
    return null;
  // Missing volume may still produce a price-only preview; it cannot authorize a hold.
  if (value.volumeLitres && volume === null) return null;
  return {
    item_category_code: category.code,
    declared_quantity:
      category.input.quantity === 'OPTIONAL' ? (quantity ?? null) : null,
    weight_band: value.weightBand,
    weight_kg: value.weightBand === 'ABOVE_T' ? value.weightKg! : null,
    declared_volume_ml: volume,
  };
}
