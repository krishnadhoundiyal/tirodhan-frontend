import { View, Pressable, TextInput } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { ActionModal } from '../../components/ActionModal';
import { Body, Button, Heading } from '../../components/ui';
import { colors } from '../../theme/tokens';
import MediaImage from '../media/MediaImage';
import { useDraft } from './DraftProvider';
import type { Category } from './catalogue';
function DeclarationForm({ category }: { category: Category }) {
  const draft = useDraft();
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<{ quantity: string; weightGrams: string }>({
    defaultValues: {
      quantity: String(draft.declarations[category.code]?.quantity ?? ''),
      weightGrams: String(draft.declarations[category.code]?.weightGrams ?? ''),
    },
  });
  const valid = (value: string) =>
    !value ||
    (/^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))) ||
    'Enter a whole number greater than zero.';
  return (
    <View style={{ gap: 8 }}>
      {(
        [
          ['quantity', 'Declared quantity', category.input.quantity],
          [
            'weightGrams',
            'Declared weight (grams)',
            category.input.weight_grams,
          ],
        ] as const
      )
        .filter((row) => row[2] === 'OPTIONAL')
        .map(([name, label]) => (
          <Controller
            key={name}
            control={control}
            name={name}
            rules={{ validate: valid }}
            render={({ field }) => (
              <View>
                <Body>{label} · optional</Body>
                <TextInput
                  accessibilityLabel={`${label} for ${category.name}`}
                  value={field.value}
                  onChangeText={field.onChange}
                  keyboardType="number-pad"
                  style={{
                    minHeight: 48,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 10,
                    borderRadius: 8,
                  }}
                />
                {errors[name] && (
                  <Body accessibilityRole="alert">{errors[name]?.message}</Body>
                )}
              </View>
            )}
          />
        ))}
      <Button
        secondary
        label={`Save amounts for ${category.name}`}
        onPress={() =>
          void handleSubmit((values) =>
            draft.declare(category.code, {
              quantity: values.quantity ? Number(values.quantity) : undefined,
              weightGrams: values.weightGrams
                ? Number(values.weightGrams)
                : undefined,
            }),
          )()
        }
      />
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
  const draft = useDraft();
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
              {selected &&
                (category.input.quantity === 'OPTIONAL' ||
                  category.input.weight_grams === 'OPTIONAL') && (
                  <DeclarationForm category={category} />
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
