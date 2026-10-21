import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Header } from '../../components/Header';
import {
  Body,
  Button,
  Card,
  Heading,
  StatusCard,
  TextAction,
  styles,
} from '../../components/ui';
import { useDraft } from './DraftProvider';
import { useCatalogue, useCustomerOwner } from './queries';
import { repositories } from '../../lib/repositories';
import type { PreparedCommand } from '../../api/transport';
import type {
  CollectionResponse,
  ServiceabilityContext,
} from '../../api/contracts';
import { ApiError, userMessage, ambiguousCommand } from '../../api/errors';
import { slotSelectable, slotLabel } from '../../api/slot-contracts';
import { PhysicalLoadRequired, RecoveryRequired } from './bookingFlow';
import { colors } from '../../theme/tokens';
import MediaImage from '../media/MediaImage';
import ItemSelector from './ItemSelector';
import DistanceConfirmation from '../addresses/DistanceConfirmation';
import { needsAddressConfirmation } from '../addresses/distance';
import { serviceabilityState } from './serviceabilityState';

export default function ReviewScreen() {
  const draft = useDraft(),
    catalogue = useCatalogue(),
    owner = useCustomerOwner(),
    queryClient = useQueryClient();
  const flow = draft.bookingFlow;
  const stage = useSyncExternalStore(flow.subscribe, flow.getSnapshot);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryError, setRecoveryError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    void flow
      .initialize()
      .then(() => {
        if (active) setRecoveryReady(true);
      })
      .catch((error) => {
        if (active) setRecoveryError(error);
      });
    return () => {
      active = false;
    };
  }, [flow]);
  const [now, setNow] = useState(Date.now),
    [editing, setEditing] = useState(false),
    [distance, setDistance] = useState<number | null>(null);
  const [chosen, setChosen] = useState<{
    contextId: string;
    slotId: string;
    generation: number;
  } | null>(null);
  const addressKey = `${owner}:${draft.address?.address_id}:${draft.address?.version}`;
  const [selectionAddress, setSelectionAddress] = useState(addressKey);
  if (selectionAddress !== addressKey) {
    setSelectionAddress(addressKey);
    setChosen(null);
  }
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);
  const selected = useMemo(
    () =>
      catalogue.data?.categories.filter(
        (item) => item.active && draft.categoryCodes.includes(item.code),
      ) ?? [],
    [catalogue.data, draft.categoryCodes],
  );
  const preparedCheck = useRef<{
    identity: string;
    expiresAt?: number;
    command: PreparedCommand<ServiceabilityContext>;
  } | null>(null);
  const check = useMutation({
    mutationFn: async () => {
      if (!draft.address) throw new ApiError(0, 'protocol');
      const identity = `${draft.address.address_id}:${draft.address.version}`;
      if (
        preparedCheck.current?.identity !== identity ||
        (currentContext?.serviceability_context_id ===
          check.data?.serviceability_context_id &&
          currentContext !== undefined &&
          currentContext.status !== 'PENDING') ||
        (preparedCheck.current.expiresAt !== undefined &&
          preparedCheck.current.expiresAt <= Date.now())
      )
        preparedCheck.current = {
          identity,
          command: repositories.serviceability(draft.address),
        };
      const command = preparedCheck.current.command,
        result = await command.execute();
      if (preparedCheck.current?.command === command)
        preparedCheck.current.expiresAt = Date.parse(result.expires_at);
      return result;
    },
    onSuccess: (result) => {
      setChosen(null);
      void queryClient.invalidateQueries({
        queryKey: ['serviceability', owner, result.serviceability_context_id],
      });
    },
  });
  const context = useQuery({
    queryKey: ['serviceability', owner, check.data?.serviceability_context_id],
    queryFn: ({ signal }) =>
      repositories.readServiceability(
        check.data!.serviceability_context_id,
        signal,
      ),
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
  const currentContext = context.data ?? check.data;
  const availability = serviceabilityState(currentContext, draft.address, now);
  const slots = useQuery({
    queryKey: [
      'slots',
      owner,
      currentContext?.serviceability_context_id,
      draft.address?.address_id,
      draft.address?.version,
    ],
    queryFn: ({ signal }) =>
      repositories.slots(currentContext!.serviceability_context_id, signal),
    enabled: availability === 'serviceable',
    retry: false,
    staleTime: 0,
    refetchInterval: (query) => {
      const expiries =
        query.state.data?.slots
          .map((item) => Date.parse(item.valid_until))
          .filter((value) => value > Date.now()) ?? [];
      return expiries.length
        ? Math.max(1000, Math.min(...expiries) - Date.now())
        : false;
    },
  });
  const currentTime = Math.max(now, slots.dataUpdatedAt);
  const slot =
    chosen &&
    slots.data?.serviceability_context_id ===
      currentContext?.serviceability_context_id &&
    chosen.contextId === currentContext?.serviceability_context_id &&
    !slots.isError &&
    !slots.isFetching
      ? slots.data?.slots.find(
          (item) =>
            item.slot_start === chosen.slotId &&
            item.generation === chosen.generation &&
            slotSelectable(item, currentTime),
        )
      : undefined;
  const bookingCommand = useRef<PreparedCommand<CollectionResponse> | null>(
    null,
  );
  const booking = useMutation({
    mutationFn: async () => {
      if (repositories.source === 'backend') {
        // A prepared command may be replayed even after projections/context/hold expire.
        if (stage !== 'idle') return flow.submit();
        if (
          !slot ||
          !currentContext ||
          !slots.data ||
          !selected.length ||
          serviceabilityState(currentContext, draft.address, Date.now()) !==
            'serviceable'
        )
          throw new ApiError(409, 'http', 'SLOT_UNAVAILABLE');
        return flow.submit({
          context: currentContext,
          availability: slots.data,
          slot,
          items: selected.map((item) => ({
            item_category_code: item.code,
            declared_quantity:
              item.input.quantity === 'OPTIONAL'
                ? (draft.declarations[item.code]?.quantity ?? null)
                : null,
            declared_weight_grams:
              item.input.weight_grams === 'OPTIONAL'
                ? (draft.declarations[item.code]?.weightGrams ?? null)
                : null,
          })),
          // No approved mass/volume mapping exists. Do not infer it from optional declarations.
          load: null,
        });
      }
      // Existing SCREEN_PREVIEW fixture booking remains local and never acquires real capacity.
      if (!bookingCommand.current) {
        if (
          !slot ||
          serviceabilityState(currentContext, draft.address, Date.now()) !==
            'serviceable' ||
          !slotSelectable(slot, Date.now()) ||
          !selected.length ||
          !currentContext
        )
          throw new ApiError(409, 'http', 'SLOT_UNAVAILABLE');
        bookingCommand.current = repositories.createCollection({
          client_request_id: randomUUID(),
          serviceability_context_id: currentContext.serviceability_context_id,
          slot_start: slot.slot_start,
          slot_end: slot.slot_end,
          items: selected.map((item) => ({
            item_category_code: item.code,
            declared_quantity:
              item.input.quantity === 'OPTIONAL'
                ? (draft.declarations[item.code]?.quantity ?? null)
                : null,
            declared_weight_grams:
              item.input.weight_grams === 'OPTIONAL'
                ? (draft.declarations[item.code]?.weightGrams ?? null)
                : null,
          })),
        });
      }
      return bookingCommand.current.execute();
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['collections', owner] });
      if (!flow.ownsSession()) return;
      router.push({
        pathname: '/collections/[requestId]',
        params: { requestId: result.request_id },
      });
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.kind === 'http' &&
        !ambiguousCommand(error)
      ) {
        bookingCommand.current = null;
        if (error.status === 409) {
          setChosen(null);
          void queryClient.invalidateQueries({
            queryKey: ['serviceability', owner],
          });
          void queryClient.invalidateQueries({ queryKey: ['slots', owner] });
        }
      }
    },
  });
  const uncertain =
    stage === 'uncertainHold' ||
    stage === 'uncertainBooking' ||
    (booking.isError && ambiguousCommand(booking.error));
  const locked =
    booking.isPending ||
    uncertain ||
    booking.isSuccess ||
    stage !== 'idle' ||
    !recoveryReady;
  const loadBlocked = repositories.source === 'backend' && stage === 'idle';
  // Retain the exact prepared intent after ambiguity; edits cannot silently create a second booking.
  const confirm = (confirmed = false) => {
    const warning = needsAddressConfirmation(
      draft.address,
      draft.currentLocation,
      draft.confirmedAddress,
    );
    if (!confirmed && warning !== null && !uncertain) {
      setDistance(warning);
      return;
    }
    if (confirmed) draft.confirmAddress();
    setDistance(null);
    booking.mutate();
  };
  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <Header back address={false} />
      <ScrollView contentContainerStyle={styles.content}>
        <Heading>Review your collection</Heading>
        <Body>Make sure everything looks right before pickup.</Body>
        {catalogue.isError && (
          <StatusCard
            title="Unable to load collection items"
            error={catalogue.error}
            retry={() => void catalogue.refetch()}
          />
        )}
        <Card>
          <Heading style={{ fontSize: 27 }}>Selected for this pickup</Heading>
          <Body>
            {selected.length}{' '}
            {selected.length === 1 ? 'category' : 'categories'} · Sacred items
            for a respectful onward journey.
          </Body>
          {selected.map((item) => (
            <View
              key={item.code}
              style={{
                flexDirection: 'column',
                gap: 12,
                alignItems: 'stretch',
                marginVertical: 8,
              }}
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
              >
                <MediaImage
                  media={item.thumbnail}
                  thumbnail
                  style={{ width: 65, height: 65, borderRadius: 10 }}
                />
                <View style={{ flex: 1 }}>
                  <Heading style={{ fontSize: 23, lineHeight: 26 }}>
                    {item.name}
                  </Heading>
                  <Body>
                    {draft.declarations[item.code]?.quantity
                      ? `Quantity: ${draft.declarations[item.code]?.quantity}`
                      : ''}
                    {draft.declarations[item.code]?.weightGrams
                      ? ` · ${draft.declarations[item.code]?.weightGrams} grams`
                      : ''}
                  </Body>
                </View>
              </View>
              {!locked && (
                <TextAction
                  label={`Remove ${item.name}`}
                  onPress={() => draft.removeCategory(item.code)}
                />
              )}
            </View>
          ))}
          {!locked && (
            <TextAction
              label="Add or edit →"
              onPress={() => setEditing(true)}
            />
          )}
          {!selected.length && (
            <Body>Select the materials you would like to hand over.</Body>
          )}
        </Card>
        <Card>
          <Heading style={{ fontSize: 25 }}>Pickup address</Heading>
          <Body>{draft.address?.label}</Body>
          <Body>{draft.address?.address ?? 'Choose a pickup address'}</Body>
          {!locked && (
            <TextAction
              label="Change →"
              onPress={() => router.push('/addresses')}
            />
          )}
          {draft.address && !locked && (
            <Button
              secondary
              label="Check pickup availability"
              busy={check.isPending}
              onPress={() => check.mutate()}
            />
          )}
          {check.isError && (
            <Body accessibilityRole="alert">{userMessage(check.error)}</Body>
          )}
          <Body>
            {
              {
                missing: 'Check availability for this address.',
                expired: 'This availability check has expired. Check again.',
                serviceable: 'This address is serviceable.',
                pending: 'Checking pickup availability…',
                unserviceable:
                  'Pickup is not currently available at this address.',
                technicalFailure:
                  'We couldn’t check availability. Please try again.',
              }[availability]
            }
          </Body>
          {context.isError && (
            <StatusCard
              title="Availability update unavailable"
              error={context.error}
              retry={() => void context.refetch()}
            />
          )}
        </Card>
        <Card>
          <Heading style={{ fontSize: 25 }}>Pickup slot</Heading>
          <Body>
            Estimated pickup capacity. Rider assignment is confirmed through
            operational planning.
          </Body>
          {slots.isFetching && <Body>Loading pickup times…</Body>}
          {slots.isError && (
            <StatusCard
              title="Pickup times unavailable"
              error={slots.error}
              retry={() => void slots.refetch()}
            />
          )}
          {availability === 'serviceable' &&
            slots.data &&
            slots.data.slots.some(
              (item) => Date.parse(item.valid_until) <= now,
            ) && (
              <Body>
                These pickup times have expired. Refresh availability.
              </Body>
            )}
          {availability === 'serviceable' &&
            slots.data?.slots.map((item) => (
              <Pressable
                key={item.slot_start}
                accessibilityRole="radio"
                accessibilityLabel={`${slotLabel(item)} · ${item.status}`}
                accessibilityState={{
                  checked: slot?.slot_start === item.slot_start,
                  disabled:
                    locked ||
                    slots.isError ||
                    slots.isFetching ||
                    !slotSelectable(item, currentTime),
                }}
                disabled={
                  locked ||
                  slots.isError ||
                  slots.isFetching ||
                  !slotSelectable(item, currentTime)
                }
                onPress={() =>
                  setChosen({
                    contextId: slots.data!.serviceability_context_id,
                    slotId: item.slot_start,
                    generation: item.generation,
                  })
                }
                style={{
                  minHeight: 48,
                  padding: 12,
                  borderWidth: 1,
                  borderColor:
                    slot?.slot_start === item.slot_start
                      ? colors.gold
                      : colors.border,
                  borderRadius: 8,
                  marginTop: 8,
                }}
              >
                <Body>
                  {slot?.slot_start === item.slot_start ? '◉ ' : '○ '}
                  {slotLabel(item)} ·{' '}
                  {
                    {
                      AVAILABLE: 'Available',
                      LIMITED: 'Limited',
                      FULL: 'Full',
                      UNKNOWN: 'Availability unknown',
                    }[item.status]
                  }
                </Body>
              </Pressable>
            ))}
          {availability !== 'serviceable' && (
            <Body>Confirm address availability to see pickup times.</Body>
          )}
          {availability === 'serviceable' && slots.data?.slots.length === 0 && (
            <Body>No pickup times are currently available.</Body>
          )}
          {availability === 'serviceable' && (
            <TextAction
              label="Refresh pickup times"
              onPress={() => {
                setChosen(null);
                void slots.refetch();
              }}
            />
          )}
          {loadBlocked && (
            <Body accessibilityRole="alert">
              Booking is temporarily unavailable while Tirodhan confirms the
              required pickup load details.
            </Body>
          )}
          {flow.getHold() && (
            <Body>
              Hold booking cutoff:{' '}
              {new Date(flow.getHold()!.book_by).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
              })}{' '}
              IST. Payment is still pending.
            </Body>
          )}
          {(stage === 'restart' || !!recoveryError) && (
            <StatusCard
              title="Previous booking needs checking"
              detail="Recovery information was retained. Check Bookings before starting another booking; the original submission may have completed."
              error={
                recoveryError instanceof RecoveryRequired
                  ? undefined
                  : (recoveryError ?? undefined)
              }
              retry={() => {
                void flow
                  .recoverRestart()
                  .then((id) => {
                    setRecoveryReady(true);
                    setRecoveryError(null);
                    if (id)
                      router.push({
                        pathname: '/collections/[requestId]',
                        params: { requestId: id },
                      });
                  })
                  .catch(setRecoveryError);
              }}
            />
          )}
        </Card>
        <Card>
          <Heading style={{ fontSize: 26 }}>
            Journey of your sacred items
          </Heading>
          <Body>
            A transparent and respectful process, every step of the way.
          </Body>
          <View style={{ flexDirection: 'row', gap: 10, marginVertical: 12 }}>
            {(
              [
                'Your home',
                'Human-powered collection',
                'Authorised receiving point',
              ] as const
            ).map((label, index) => (
              <View
                key={label}
                style={{ flex: 1, alignItems: 'center', gap: 8 }}
              >
                {index < 2 ? (
                  <MediaImage
                    media={
                      (index === 0
                        ? catalogue.data?.artwork.home
                        : catalogue.data?.artwork.rickshaw) ?? null
                    }
                    style={{ height: 65, width: '100%' }}
                    fit="contain"
                  />
                ) : (
                  <Ionicons
                    name="business-outline"
                    size={55}
                    color={colors.goldText}
                  />
                )}
                <Heading
                  style={{ fontSize: 18, lineHeight: 22, textAlign: 'center' }}
                >
                  {label}
                </Heading>
              </View>
            ))}
          </View>
          <Body>
            Your confirmed destination and validated handover will appear in the
            collection details when recorded.
          </Body>
        </Card>
        <Card>
          <Heading style={{ fontSize: 25 }}>Collection summary</Heading>
          <Body>
            Tirodhan confirms the collection charge after your pickup details
            are submitted. Payment remains pending until confirmed by the
            server.
          </Body>
        </Card>
        <Card>
          <Heading style={{ fontSize: 25 }}>Important note</Heading>
          <Body>
            Only household puja items, sacred idols and related materials are
            accepted. Pack them cleanly and safely for our collection partner.
          </Body>
        </Card>
        {booking.isError && (
          <Body accessibilityRole="alert" style={{ color: colors.error }}>
            {uncertain
              ? 'We couldn’t confirm the booking result. Retry this same booking before making changes, or check Bookings.'
              : booking.error instanceof PhysicalLoadRequired
                ? 'Booking is waiting for approved pickup load details.'
                : booking.error instanceof RecoveryRequired
                  ? 'Check the previous booking in Bookings before starting another.'
                  : userMessage(booking.error)}
          </Body>
        )}
      </ScrollView>
      <View
        style={{ padding: 16, borderTopWidth: 1, borderColor: colors.border }}
      >
        <Button
          label={
            uncertain
              ? stage === 'uncertainHold'
                ? 'Recover same hold'
                : 'Retry same booking'
              : stage === 'held'
                ? 'Continue held booking'
                : 'Confirm & Pay →'
          }
          busy={booking.isPending}
          disabled={
            !recoveryReady ||
            loadBlocked ||
            stage === 'restart' ||
            (!uncertain &&
              stage !== 'held' &&
              (!slot ||
                !selected.length ||
                availability !== 'serviceable' ||
                booking.isSuccess))
          }
          onPress={() => confirm()}
        />
        <Body style={{ textAlign: 'center', fontSize: 11, marginTop: 8 }}>
          Payment confirmation is always verified by Tirodhan.
        </Body>
      </View>
      <ItemSelector
        visible={editing}
        close={() => setEditing(false)}
        categories={catalogue.data?.categories ?? []}
      />
      <DistanceConfirmation
        distance={distance}
        confirm={() => confirm(true)}
        chooseAnother={() => {
          setDistance(null);
          router.push('/addresses');
        }}
      />
    </SafeAreaView>
  );
}
