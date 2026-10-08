import { memo, useMemo } from 'react';
import { FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Header } from '../../components/Header';
import {
  Body,
  Button,
  Card,
  Heading,
  Skeleton,
  StatusCard,
  styles,
} from '../../components/ui';
import { colors, fonts } from '../../theme/tokens';
import { type Category, type Catalogue } from '../collection/catalogue';
import { useDraft } from '../collection/DraftProvider';
import MediaImage from '../media/MediaImage';
import { useCatalogue, useCollections } from '../collection/queries';
import Recommendations from './Recommendations';
import { CollectionCard } from '../activity/ActivityScreen';
const CategoryCard = memo(function CategoryCard({
  item,
  width,
}: {
  item: Category;
  width: number;
}) {
  const { categoryCodes, toggleCategory } = useDraft();
  const selected = categoryCodes.includes(item.code);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`Select ${item.name}`}
      accessibilityState={{ checked: selected }}
      onPress={() => toggleCategory(item.code)}
      style={{
        width,
        backgroundColor: colors.surface,
        borderRadius: 11,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: selected ? colors.gold : colors.border,
      }}
    >
      <MediaImage
        media={item.image}
        style={{ height: 90, width: '100%', backgroundColor: colors.tint }}
      />
      <View style={{ padding: 9, gap: 5 }}>
        <Heading style={{ fontSize: 19, lineHeight: 21, marginBottom: 0 }}>
          {item.name}
        </Heading>
        <Body style={{ fontSize: 11, lineHeight: 16 }}>{item.description}</Body>
        <Body
          style={{
            color: colors.goldText,
            textAlign: 'right',
            fontFamily: fonts.semibold,
          }}
        >
          {selected ? '✓ Selected' : '+ Select'}
        </Body>
      </View>
    </Pressable>
  );
});
function Group({
  name,
  categories,
  width,
}: {
  name: string;
  categories: Category[];
  width: number;
}) {
  return (
    <View style={{ marginTop: 18 }}>
      <Heading style={{ fontSize: 27, lineHeight: 30, paddingHorizontal: 18 }}>
        {name}
      </Heading>
      <FlatList
        horizontal
        data={categories}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.code}
        contentContainerStyle={{ paddingHorizontal: 18, gap: 9 }}
        renderItem={({ item }) => <CategoryCard item={item} width={width} />}
      />
    </View>
  );
}
function Hero({ catalogue }: { catalogue?: Catalogue }) {
  return (
    <View style={{ paddingHorizontal: 18, marginTop: 4 }}>
      <View
        style={{
          backgroundColor: colors.tint,
          borderRadius: 18,
          overflow: 'hidden',
          minHeight: 208,
        }}
      >
        <MediaImage
          media={catalogue?.artwork.hero ?? null}
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: '48%',
          }}
        />
        <View style={{ width: '62%', padding: 16, backgroundColor: '#F8EEDD' }}>
          <Body
            style={{
              fontSize: 10,
              letterSpacing: 2,
              color: colors.goldText,
              marginBottom: 7,
            }}
          >
            SACRED COLLECTION
          </Body>
          <Heading style={{ fontSize: 23, lineHeight: 24 }}>
            Give sacred items a respectful onward journey.
          </Heading>
          <Body
            style={{
              fontSize: 12,
              lineHeight: 17,
              color: colors.text,
              marginBottom: 12,
            }}
          >
            We collect and ensure proper, respectful handling.
          </Body>
          <Button
            label="Book a pickup →"
            onPress={() => router.push('/review')}
          />
        </View>
      </View>
      <Body
        style={{
          textAlign: 'center',
          color: colors.gold,
          letterSpacing: 6,
          marginVertical: 6,
        }}
      >
        ● ○ ○ ○
      </Body>
    </View>
  );
}
function QuickCategories({ catalogue }: { catalogue: Catalogue }) {
  const { categoryCodes, toggleCategory } = useDraft();
  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 18, gap: 12 }}
      data={catalogue.quick}
      keyExtractor={(item) => item.categoryCode}
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{
            checked: categoryCodes.includes(item.categoryCode),
          }}
          accessibilityLabel={item.label.replace('\n', ' ')}
          onPress={() => toggleCategory(item.categoryCode)}
          style={{ width: 58, alignItems: 'center', gap: 6 }}
        >
          <MediaImage
            media={
              catalogue.categories.find(
                (category) => category.code === item.categoryCode,
              )?.thumbnail ?? null
            }
            thumbnail
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              borderWidth: 2,
              borderColor: categoryCodes.includes(item.categoryCode)
                ? colors.gold
                : colors.tint,
            }}
          />
          <Body
            style={{
              fontSize: 10,
              lineHeight: 14,
              color: colors.text,
              textAlign: 'center',
            }}
          >
            {item.label}
          </Body>
        </Pressable>
      )}
    />
  );
}
export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const query = useCatalogue();
  const active = useCollections('active');
  const sections = useMemo(
    () =>
      query.data?.groups
        .filter((group) => group.active)
        .sort((a, b) => a.order - b.order)
        .map((group) => ({
          ...group,
          categories: query
            .data!.categories.filter(
              (category) => category.active && category.group === group.code,
            )
            .sort((a, b) => a.order - b.order),
        })) ?? [],
    [query.data],
  );
  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <Header />
      <FlatList
        data={sections}
        keyExtractor={(group) => group.code}
        renderItem={({ item }) => (
          <Group
            name={item.name}
            categories={item.categories}
            width={Math.min(160, (width - 45) / 2.5)}
          />
        )}
        ListHeaderComponent={
          <>
            <Hero catalogue={query.data} />
            {query.data && <QuickCategories catalogue={query.data} />}
            {query.isPending && (
              <View style={{ padding: 18 }}>
                <Skeleton height={180} />
                <Skeleton />
              </View>
            )}
            {query.isError && (
              <View style={{ padding: 18 }}>
                <StatusCard
                  title="Collection groups"
                  error={query.error}
                  retry={() => void query.refetch()}
                />
              </View>
            )}
          </>
        }
        ListFooterComponent={
          <View style={styles.content}>
            <Heading style={{ fontSize: 27 }}>Your Activity</Heading>
            {active.data?.pages[0]?.items[0] && (
              <CollectionCard
                item={active.data.pages[0].items[0]}
                catalogue={query.data}
                compact
              />
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/activity')}
            >
              <Card>
                <Heading style={{ fontSize: 23 }}>
                  Journey of your sacred items →
                </Heading>
                <Body>View your collection journey and past collections.</Body>
              </Card>
            </Pressable>
            <Recommendations catalogue={query.data} />
          </View>
        }
      />
    </SafeAreaView>
  );
}
