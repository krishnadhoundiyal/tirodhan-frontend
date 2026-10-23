import { View, Pressable, TextInput } from 'react-native';
import { useState } from 'react';
import { ActionModal } from '../../components/ActionModal';
import { Body, Button, Heading, StatusCard } from '../../components/ui';
import { colors } from '../../theme/tokens';
import MediaImage from '../media/MediaImage';
import { useDraft } from './DraftProvider';
import type { Category } from './catalogue';
import { useWeightPolicy } from './queries';
import { declarationItem } from './declarations';
import { milliUnits, type WeightPolicy } from '../../api/weight-contracts';

function DeclarationForm({
  category,
  policy,
}: {
  category: Category;
  policy: WeightPolicy;
}) {
  const draft = useDraft(),
    value = draft.declarations[category.code] ?? {};
  const [saved, setSaved] = useState<string | null>(null);
  const current =
    value.policyId === policy.policy_id &&
    value.policyRevision === policy.policy_revision;
  const inputStyle = {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    borderRadius: 8,
  };
  const options = [
    [
      'BELOW_B',
      `${policy.first_band_label} · less than ${policy.first_band_upper_grams / 1000} kg`,
    ],
    [
      'B_TO_T',
      `${policy.middle_band_label} · ${policy.first_band_upper_grams / 1000}–${policy.numerical_threshold_grams / 1000} kg`,
    ],
    [
      'ABOVE_T',
      `${policy.open_band_label} · above ${policy.numerical_threshold_grams / 1000} kg`,
    ],
  ] as const;
  const item = declarationItem(category, value, policy);
  return (
    <View style={{ gap: 8 }}>
      <Body>
        Weight and occupied space cover all items in this category, including
        packaging.
      </Body>
      {options.map(([band, label]) => (
        <Pressable
          key={band}
          accessibilityRole="radio"
          accessibilityLabel={`${label} for ${category.name}`}
          accessibilityState={{ checked: current && value.weightBand === band }}
          onPress={() =>
            draft.declare(category.code, {
              ...value,
              weightBand: band,
              weightKg: band === 'ABOVE_T' ? value.weightKg : undefined,
              policyId: policy.policy_id,
              policyRevision: policy.policy_revision,
            })
          }
          style={inputStyle}
        >
          <Body>
            {current && value.weightBand === band ? '◉ ' : '○ '}
            {label}
          </Body>
        </Pressable>
      ))}
      {!current && value.weightBand && (
        <Body accessibilityRole="alert">
          Weight bands have changed. Please select a current band.
        </Body>
      )}
      {current && value.weightBand === 'ABOVE_T' && (
        <View>
          <Body>
            Total weight (kg) · above {policy.numerical_threshold_grams / 1000}{' '}
            kg
          </Body>
          <TextInput
            accessibilityLabel={`Weight in kilograms for ${category.name}`}
            keyboardType="decimal-pad"
            value={value.weightKg ?? ''}
            onChangeText={(text) =>
              draft.declare(category.code, { ...value, weightKg: text })
            }
            style={inputStyle}
          />
          {(milliUnits(value.weightKg ?? '') ?? 0) <=
            policy.numerical_threshold_grams && (
            <Body accessibilityRole="alert">
              Enter kilograms above the threshold, with up to 3 decimal places.
            </Body>
          )}
        </View>
      )}
      {category.input.quantity === 'OPTIONAL' && (
        <View>
          <Body>Declared quantity · optional</Body>
          <TextInput
            accessibilityLabel={`Declared quantity for ${category.name}`}
            keyboardType="number-pad"
            value={value.quantityText ?? String(value.quantity ?? '')}
            onChangeText={(text) =>
              draft.declare(category.code, {
                ...value,
                quantityText: text,
                quantity: /^[1-9]\d*$/.test(text) ? Number(text) : undefined,
              })
            }
            style={inputStyle}
          />
        </View>
      )}
      <Body>
        Approximate occupied volume (litres) · whole quantity including
        packaging
      </Body>
      <TextInput
        accessibilityLabel={`Occupied volume in litres for ${category.name}`}
        keyboardType="decimal-pad"
        value={value.volumeLitres ?? ''}
        onChangeText={(text) =>
          draft.declare(category.code, { ...value, volumeLitres: text })
        }
        style={inputStyle}
      />
      <Body>
        1 litre = 1000 ml. Enter the space these packed items occupy, for the
        whole quantity.
      </Body>
      {milliUnits(value.volumeLitres ?? '') === null && (
        <Body accessibilityRole="alert">
          Enter a positive volume in litres, with up to 3 decimal places.
        </Body>
      )}
      {!item && (
        <Body>
          Complete the current weight band and valid amounts to request a price.
        </Body>
      )}
      <Button
        secondary
        label={`Save amounts for ${category.name}`}
        disabled={!item || item.declared_volume_ml == null}
        onPress={() => setSaved(JSON.stringify(value))}
      />
      {saved === JSON.stringify(value) && (
        <Body accessibilityLiveRegion="polite">
          Amounts saved. The pickup price updates in Review.
        </Body>
      )}
    </View>
  );
}
export default function ItemSelector({
  visible,
  close,
  categories,
}: {
  visible: boolean;
  close(): void;
  categories: readonly Category[];
}) {
  const draft = useDraft(),
    policy = useWeightPolicy(visible);
  return (
    <ActionModal
      visible={visible}
      title="Add or edit collection items"
      close={close}
    >
      <Body>
        Select the materials for this pickup. Your address and other pickup
        details stay in place.
      </Body>
      {policy.isFetching && <Body>Loading current weight bands…</Body>}
      {policy.isError && (
        <StatusCard
          title="Weight bands unavailable"
          error={policy.error}
          retry={() => void policy.refetch()}
        />
      )}
      {categories
        .filter((category) => category.active)
        .map((category) => {
          const selected = draft.categoryCodes.includes(category.code);
          return (
            <View
              key={category.code}
              style={{
                paddingVertical: 10,
                gap: 8,
                borderBottomWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`Select ${category.name}`}
                onPress={() =>
                  selected
                    ? draft.removeCategory(category.code)
                    : draft.toggleCategory(category.code)
                }
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'center',
                  minHeight: 64,
                }}
              >
                <MediaImage
                  media={category.thumbnail}
                  thumbnail
                  style={{ width: 58, height: 58, borderRadius: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Heading
                    style={{ fontSize: 22, lineHeight: 25, marginBottom: 3 }}
                  >
                    {category.name}
                  </Heading>
                  <Body style={{ fontSize: 12 }}>{category.description}</Body>
                </View>
                <Body style={{ color: colors.goldText, fontSize: 22 }}>
                  {selected ? '✓' : '+'}
                </Body>
              </Pressable>
              {selected && policy.data && !policy.isError && (
                <DeclarationForm category={category} policy={policy.data} />
              )}
            </View>
          );
        })}
      {!categories.length && (
        <Body>
          Collection items are not available yet. Please try again later.
        </Body>
      )}
      <Button label="Done · return to Review" onPress={close} />
    </ActionModal>
  );
}
