import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../components/Header';
import {
  Body,
  Card,
  Heading,
  Skeleton,
  StatusCard,
  styles,
} from '../../components/ui';
import { activityRepository } from './repository';
import { ContractUnavailable } from '../../lib/unavailable';
import { assets } from '../collection/assets';
import { colors } from '../../theme/tokens';
export default function ActivityScreen({
  bookings = false,
}: {
  bookings?: boolean;
}) {
  const [segment, setSegment] = useState<'active' | 'history'>('active');
  const query = useQuery({
    queryKey: ['activity', segment],
    queryFn: ({ signal }) => activityRepository.read(segment, signal),
    retry: false,
  });
  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <Header />
      <FlatList
        data={query.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Heading>{bookings ? 'Bookings' : 'Activity'}</Heading>
            <View
              style={{
                flexDirection: 'row',
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                overflow: 'hidden',
                marginBottom: 16,
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
                    backgroundColor:
                      segment === value ? colors.gold : colors.surface,
                  }}
                >
                  <Body
                    style={{
                      textAlign: 'center',
                      color: colors.text,
                    }}
                  >
                    {value === 'active' ? 'Active' : 'History'}
                  </Body>
                </Pressable>
              ))}
            </View>
          </>
        }
        renderItem={({ item }) => (
          <Card>
            <Body style={{ color: colors.goldText, letterSpacing: 2 }}>
              CURRENT JOURNEY
            </Body>
            <Heading>{item.title}</Heading>
            <Image
              source={assets.journey}
              accessibilityLabel="Human-powered collection"
              style={{ height: 150, borderRadius: 12 }}
            />
            <Body>{item.slotLabel}</Body>
            <Body>{item.addressLabel}</Body>
            <Heading style={{ fontSize: 25 }}>
              Journey of your sacred items
            </Heading>
            {item.steps.map((step) => (
              <View key={step.label} style={{ flexDirection: 'row', gap: 10 }}>
                <Body style={{ color: colors.goldText }}>
                  {step.completed ? '●' : '○'}
                </Body>
                <View>
                  <Body style={{ color: colors.text }}>{step.label}</Body>
                  <Body>{step.detail}</Body>
                </View>
              </View>
            ))}
          </Card>
        )}
        ListEmptyComponent={
          query.isPending ? (
            <View>
              <Skeleton height={210} />
              <Skeleton height={170} />
            </View>
          ) : query.error instanceof ContractUnavailable ? (
            <View>
              <Card>
                <Image
                  source={assets.journey}
                  accessibilityLabel="Human-powered collection"
                  contentFit="cover"
                  style={{ height: 155, borderRadius: 12 }}
                />
                <Body style={{ letterSpacing: 2, color: colors.goldText }}>
                  YOUR SACRED COLLECTION
                </Body>
                <Heading style={{ fontSize: 28 }}>
                  Every handover has a journey
                </Heading>
                <Body>
                  Your collection progress and authorised receiving destination
                  will appear here when journey updates become available.
                </Body>
              </Card>
              <Heading style={{ fontSize: 27, marginTop: 24 }}>
                Past collections
              </Heading>
              <StatusCard
                title="Journey updates unavailable"
                detail="We can’t display your current or past collections yet. Please check back soon."
                retry={() => void query.refetch()}
              />
            </View>
          ) : query.isError ? (
            <StatusCard
              title="Unable to load your journey"
              error={query.error}
              retry={() => void query.refetch()}
            />
          ) : (
            <StatusCard
              title={
                segment === 'active'
                  ? 'No active collections'
                  : 'No past collections'
              }
              detail="Your collection journeys will appear here."
            />
          )
        }
      />
    </SafeAreaView>
  );
}
