import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Header } from '../../components/Header';
import {
  Body,
  Button,
  Card,
  Heading,
  TextAction,
  styles,
} from '../../components/ui';
import { useDraft } from './DraftProvider';
import { catalogueRepository } from './catalogue';
import { assets } from './assets';
import { slotRepository } from './slots';
import { api } from '../../api';
import type { PreparedCommand } from '../../api/transport';
import type { ServiceabilityContext } from '../../api/contracts';
import { userMessage } from '../../api/errors';
import { colors } from '../../theme/tokens';
import Ionicons from '@expo/vector-icons/Ionicons';
export default function ReviewScreen() {
  const draft = useDraft();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);
  const catalogue = useQuery({
    queryKey: ['catalogue'],
    queryFn: () => catalogueRepository.read(),
    retry: false,
  });
  const selected = useMemo(
    () =>
      catalogue.data?.categories.filter((item) =>
        draft.categoryCodes.includes(item.code),
      ) ?? [],
    [catalogue.data, draft.categoryCodes],
  );
  const prepared = useRef<{
    addressId: string;
    version: number;
    expiresAt?: number;
    command: PreparedCommand<ServiceabilityContext>;
  } | null>(null);
  const check = useMutation({
    mutationFn: async () => {
      if (!draft.address) throw new Error('Select an address');
      if (
        prepared.current?.addressId !== draft.address.address_id ||
        prepared.current.version !== draft.address.version ||
        (prepared.current.expiresAt !== undefined &&
          prepared.current.expiresAt <= Date.now())
      )
        prepared.current = {
          addressId: draft.address.address_id,
          version: draft.address.version,
          command: api.serviceability({
            source_address_id: draft.address.address_id,
          }),
        };
      const command = prepared.current.command;
      const result = await command.execute();
      if (prepared.current?.command === command)
        prepared.current.expiresAt = Date.parse(result.expires_at);
      return result;
    },
  });
  const context = useQuery({
    queryKey: ['serviceability', check.data?.serviceability_context_id],
    queryFn: ({ signal }) =>
      api.readServiceability(check.data!.serviceability_context_id, signal),
    enabled:
      !!check.data &&
      check.data.source_address_id === draft.address?.address_id &&
      check.data.source_address_version === draft.address?.version,
    refetchInterval: (query) =>
      query.state.data?.status === 'PENDING' &&
      Date.parse(query.state.data.expires_at) > Date.now()
        ? 3000
        : false,
  });
  const slots = useQuery({
    queryKey: ['slots', context.data?.serviceability_context_id],
    queryFn: ({ signal }) =>
      slotRepository.read(context.data!.serviceability_context_id, signal),
    enabled:
      context.data?.status === 'SERVICEABLE' &&
      context.data.source_address_id === draft.address?.address_id &&
      context.data.source_address_version === draft.address?.version &&
      Date.parse(context.data.expires_at) > now,
    retry: false,
  });
  const currentContext =
    context.data?.source_address_id === draft.address?.address_id &&
    context.data?.source_address_version === draft.address?.version
      ? context.data
      : undefined;
  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <Header back address={false} />
      <ScrollView contentContainerStyle={styles.content}>
        <Heading>Review your collection</Heading>
        <Body>Make sure everything looks right before pickup.</Body>
        <Card>
          <Heading style={{ fontSize: 27 }}>Selected for this pickup</Heading>
          <Body>
            {selected.length}{' '}
            {selected.length === 1 ? 'category' : 'categories'}
            {' · '}Sacred items for a respectful onward journey.
          </Body>
          <FlatList
            horizontal
            data={selected}
            keyExtractor={(item) => item.code}
            contentContainerStyle={{ gap: 10 }}
            renderItem={({ item }) => (
              <View style={{ width: 95 }}>
                <Image
                  source={assets[item.imageAssetKey]}
                  accessibilityLabel={item.alt}
                  style={{ height: 84, width: 95, borderRadius: 10 }}
                />
                <Body style={{ fontSize: 11, color: colors.text }}>
                  {item.name}
                </Body>
              </View>
            )}
          />
          <TextAction
            label="Add or edit →"
            onPress={() => router.push('/(product)/(tabs)')}
          />
          {!selected.length && (
            <Body>Select the materials you would like to hand over.</Body>
          )}
        </Card>
        <Card>
          <Heading style={{ fontSize: 25 }}>Pickup address</Heading>
          <Body>{draft.address?.label}</Body>
          <Body>{draft.address?.address ?? 'Choose a pickup address'}</Body>
          <TextAction
            label="Change →"
            onPress={() => router.push('/addresses')}
          />
          {draft.address && (
            <Button
              secondary
              label="Check pickup availability"
              busy={check.isPending}
              onPress={() => check.mutate()}
            />
          )}
          {check.isError && (
            <Body accessibilityRole="alert" style={{ color: colors.error }}>
              {userMessage(check.error)}
            </Body>
          )}
          {currentContext && (
            <Body>
              {Date.parse(currentContext.expires_at) <= now
                ? 'This availability check has expired. Check again.'
                : currentContext.status === 'SERVICEABLE'
                  ? 'This address is serviceable.'
                  : currentContext.status === 'PENDING'
                    ? 'Checking pickup availability…'
                    : 'Pickup is not currently available at this address.'}
            </Body>
          )}
          {context.isError && <Body>{userMessage(context.error)}</Body>}
        </Card>
        <Card>
          <Heading style={{ fontSize: 25 }}>Pickup slot</Heading>
          <Body>
            {slots.isPending && slots.fetchStatus === 'fetching'
              ? 'Loading pickup slots…'
              : 'Pickup times are not available yet. Booking will open when available times can be confirmed.'}
          </Body>
        </Card>
        <Card>
          <Heading style={{ fontSize: 26 }}>
            Journey of your sacred items
          </Heading>
          <Body>
            A transparent and respectful process, every step of the way.
          </Body>
          <View style={{ flexDirection: 'row', gap: 10, marginVertical: 12 }}>
            {[
              'Your home',
              'Collected by Tirodhan',
              'Authorised receiving point',
            ].map((label, index) => (
              <View
                key={label}
                style={{ flex: 1, alignItems: 'center', gap: 8 }}
              >
                <View
                  style={{
                    backgroundColor: colors.tint,
                    borderRadius: 25,
                    padding: 12,
                  }}
                >
                  <Body style={{ color: colors.goldText }}>{index + 1}</Body>
                </View>
                {index < 2 ? (
                  <Image
                    source={index === 0 ? assets.homeJourney : assets.rickshaw}
                    accessibilityLabel={label}
                    contentFit="contain"
                    style={{ height: 65, width: '100%' }}
                  />
                ) : (
                  <Ionicons
                    name="business-outline"
                    size={55}
                    color={colors.goldText}
                    accessibilityLabel="Authorised receiving point illustration"
                  />
                )}
                <Heading
                  style={{ fontSize: 19, lineHeight: 22, textAlign: 'center' }}
                >
                  {label}
                </Heading>
              </View>
            ))}
          </View>
          <Body>
            Collection uses our human-powered network. Your actual authorised
            destination will appear when it is confirmed.
          </Body>
        </Card>
        <Card>
          <Heading style={{ fontSize: 25 }}>Collection summary</Heading>
          <Body>Estimated collection charge</Body>
          <Body>
            Calculated by Tirodhan based on your confirmed pickup details.
          </Body>
        </Card>
        <Card>
          <Heading style={{ fontSize: 25 }}>Important note</Heading>
          <Body>
            Only household puja items, sacred idols and related materials are
            accepted. Items should be cleanly packed and safely handed over to
            our collection partner.
          </Body>
        </Card>
      </ScrollView>
      <View
        style={{ padding: 18, borderTopWidth: 1, borderColor: colors.border }}
      >
        <Button label="Confirm & Pay →" disabled onPress={() => {}} />
        <Body style={{ textAlign: 'center', fontSize: 11, marginTop: 8 }}>
          Booking opens when pickup times and collection details are available.
        </Body>
      </View>
    </SafeAreaView>
  );
}
