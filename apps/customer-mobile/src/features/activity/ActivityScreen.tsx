import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
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
import { colors } from '../../theme/tokens';
import { useCatalogue, useCollections } from '../collection/queries';
import type { Catalogue } from '../collection/catalogue';
import type { CollectionSummary } from '../../api/customer-contracts';
import { refundLabels } from '../collection/financial';
import MediaImage from '../media/MediaImage';
import Recommendations from '../home/Recommendations';
export function CollectionCard({
  item,
  catalogue,
  compact = false,
}: {
  item: CollectionSummary;
  catalogue?: Catalogue;
  compact?: boolean;
}) {
  const image =
    item.image ??
    (compact
      ? catalogue?.categories.find((category) =>
          item.category_codes.includes(category.code),
        )?.thumbnail
      : catalogue?.artwork.rickshaw) ??
    null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${item.title}, ${item.slot.label}`}
      onPress={() =>
        router.push({
          pathname: '/collections/[requestId]',
          params: { requestId: item.request_id },
        })
      }
    >
      <Card>
        {!compact && (
          <Body style={{ color: colors.goldText, letterSpacing: 2 }}>
            CURRENT JOURNEY
          </Body>
        )}
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 5 }}>
            <Heading
              style={{
                fontSize: compact ? 24 : 28,
                lineHeight: compact ? 27 : 31,
                marginBottom: 2,
              }}
            >
              {item.title}
            </Heading>
            <Body>{item.slot.label}</Body>
            <Body>{item.address_summary}</Body>
          </View>
          <MediaImage
            media={image}
            thumbnail={compact}
            fit={compact ? 'cover' : 'contain'}
            fallback={compact ? 'image-outline' : 'bicycle-outline'}
            style={{
              width: compact ? 74 : 100,
              height: compact ? 78 : 115,
              borderRadius: 12,
            }}
          />
        </View>
        {item.refund_status && (
          <Body style={{ color: colors.goldText }}>
            {refundLabels[item.refund_status] ??
              'Refund information unavailable'}
          </Body>
        )}
        {!compact && (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 10,
              borderTopWidth: 1,
              borderColor: colors.border,
              paddingTop: 12,
            }}
          >
            {(
              ['BOOKED', 'COLLECTED', 'RECEIVED', 'HANDOVER_VALIDATED'] as const
            ).map((step, index) => (
              <Body
                key={step}
                style={{
                  fontSize: 11,
                  color:
                    item.journey_status === step
                      ? colors.goldText
                      : colors.secondary,
                }}
              >
                {index + 1} ·{' '}
                {step === 'BOOKED'
                  ? 'Booked'
                  : step === 'COLLECTED'
                    ? 'Collected by Tirodhan'
                    : step === 'RECEIVED'
                      ? 'Authorised receiving point'
                      : 'Handover validated'}
              </Body>
            ))}
          </View>
        )}
        <Body style={{ color: colors.goldText, textAlign: 'right' }}>
          View collection →
        </Body>
      </Card>
    </Pressable>
  );
}
export default function ActivityScreen({
  bookings = false,
}: {
  bookings?: boolean;
}) {
  const [segment, setSegment] = useState<'active' | 'history'>('active');
  const query = useCollections(segment),
    catalogue = useCatalogue();
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (
      query.data?.pages
        .flatMap((page) => page.items)
        .filter((item) => {
          if (seen.has(item.request_id)) return false;
          seen.add(item.request_id);
          return true;
        }) ?? []
    );
  }, [query.data]);
  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <Header />
      <FlatList
        data={items}
        keyExtractor={(item) => item.request_id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => void query.refetch()}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 14 }}>
            <Heading>{bookings ? 'Bookings' : 'Activity'}</Heading>
            <View
              style={{
                flexDirection: 'row',
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {(['active', 'history'] as const).map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: segment === value }}
                  onPress={() => setSegment(value)}
                  style={{
                    flex: 1,
                    padding: 14,
                    minHeight: 48,
                    backgroundColor:
                      segment === value ? colors.gold : colors.surface,
                  }}
                >
                  <Body style={{ color: colors.text, textAlign: 'center' }}>
                    {value === 'active' ? 'Active' : 'History'}
                  </Body>
                </Pressable>
              ))}
            </View>
            {segment === 'history' && (
              <Body>
                Completed, cancelled and expired pickups · newest first
              </Body>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <CollectionCard
            item={item}
            catalogue={catalogue.data}
            compact={segment === 'history'}
          />
        )}
        ListEmptyComponent={
          query.isPending ? (
            <View>
              <Skeleton height={210} />
              <Skeleton height={120} />
            </View>
          ) : query.isError ? (
            <StatusCard
              title="Unable to load collections"
              error={query.error}
              retry={() => void query.refetch()}
            />
          ) : (
            <StatusCard
              title={
                segment === 'active'
                  ? 'No active pickups'
                  : 'No past collections'
              }
              detail={
                segment === 'active'
                  ? 'Book a pickup when you’re ready to hand over your sacred items.'
                  : 'Your completed and cancelled collections will appear here.'
              }
            />
          )
        }
        onEndReachedThreshold={0.3}
        onEndReached={() => {
          if (
            query.hasNextPage &&
            !query.isFetchingNextPage &&
            !query.isFetchNextPageError
          )
            void query.fetchNextPage();
        }}
        ListFooterComponent={
          <View style={{ gap: 16 }}>
            {query.isFetchingNextPage && <Skeleton height={90} />}
            {query.isFetchNextPageError && (
              <StatusCard
                title="Unable to load more collections"
                error={query.error}
                retry={() => void query.fetchNextPage()}
              />
            )}
            {query.hasNextPage && !query.isFetchingNextPage && (
              <Button
                secondary
                label="Load more collections"
                onPress={() => void query.fetchNextPage()}
              />
            )}
            {segment === 'active' && (
              <Button
                secondary
                label="View past collections →"
                onPress={() => setSegment('history')}
              />
            )}
            <Recommendations catalogue={catalogue.data} />
          </View>
        }
      />
    </SafeAreaView>
  );
}
