import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Heading } from '../../components/ui';
import { colors } from '../../theme/tokens';
import type { Catalogue, Category } from '../collection/catalogue';
import type { RecommendationDto } from '../../api/customer-contracts';
import { useRecommendations } from '../collection/queries';
import { useDraft } from '../collection/DraftProvider';
import MediaImage from '../media/MediaImage';
export function recommendedCategories(
  catalogue: Catalogue | undefined,
  response: RecommendationDto | undefined,
): Category[] {
  if (!catalogue || !response) return [];
  const seen = new Set<string>();
  return [...response.recommendations]
    .sort((a, b) => a.rank - b.rank)
    .flatMap((item) => {
      const category = catalogue.categories.find(
        (value) => value.code === item.category_code && value.active,
      );
      if (
        !category ||
        seen.has(category.code) ||
        item.reason !== 'PREVIOUS_COLLECTION'
      )
        return [];
      seen.add(category.code);
      return [category];
    });
}
export default function Recommendations({
  catalogue,
}: {
  catalogue?: Catalogue;
}) {
  const query = useRecommendations(),
    draft = useDraft();
  const categories = recommendedCategories(catalogue, query.data);
  if (!categories.length || query.isError) return null;
  return (
    <View style={{ gap: 10 }}>
      <Heading style={{ fontSize: 27 }}>
        Based on your previous collections
      </Heading>
      <FlatList
        horizontal
        data={categories}
        keyExtractor={(item) => item.code}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10 }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Book pickup for ${item.name}`}
            onPress={() => {
              if (!draft.categoryCodes.includes(item.code))
                draft.toggleCategory(item.code);
              router.push('/review');
            }}
            style={{
              width: 145,
              borderRadius: 12,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <MediaImage media={item.image} style={{ height: 95, width: 145 }} />
            <View style={{ padding: 10 }}>
              <Heading style={{ fontSize: 21, lineHeight: 24 }}>
                {item.name}
              </Heading>
              <Body style={{ fontSize: 11 }}>{item.description}</Body>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
