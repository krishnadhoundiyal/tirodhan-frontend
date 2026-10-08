import { useRef, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ExpoLocation from 'expo-location';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Header } from '../../components/Header';
import {
  Body,
  Button,
  Card,
  Heading,
  Skeleton,
  StatusCard,
  TextAction,
  styles,
} from '../../components/ui';
import { useAddresses } from './queries';
import { useDraft } from '../collection/DraftProvider';
import type { Address, Location } from '../../api/contracts';
import { colors } from '../../theme/tokens';
import MapPreview from './MapPreview';
import AddressForm from './AddressForm';
import DistanceConfirmation from './DistanceConfirmation';
import { needsAddressConfirmation } from './distance';
export default function AddressScreen() {
  const query = useAddresses();
  const draft = useDraft();
  const [selected, setSelected] = useState<Address | null>(draft.address);
  const [search, setSearch] = useState('');
  const [pin, setPin] = useState<Location | null>(selected?.location ?? null);
  const [detected, setDetected] = useState('');
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string>();
  const [form, setForm] = useState<Address | 'new' | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const continueWithAddress = (confirmed = false) => {
    if (!selected) return;
    const warning = needsAddressConfirmation(
      selected,
      draft.currentLocation,
      draft.confirmedAddress,
    );
    if (!confirmed && warning !== null) {
      setDistance(warning);
      return;
    }
    draft.selectAddress(selected);
    if (confirmed) draft.confirmAddress(selected);
    setDistance(null);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const pinGeneration = useRef(0);
  const resolvePin = async (point: Location) => {
    const generation = ++pinGeneration.current;
    setPin(point);
    setSelected(null);
    setForm(null);
    setError(undefined);
    try {
      const [result] = await ExpoLocation.reverseGeocodeAsync(point);
      if (generation !== pinGeneration.current) return;
      setDetected(
        result
          ? [
              result.name,
              result.street,
              result.district,
              result.city,
              result.postalCode,
            ]
              .filter(Boolean)
              .join(', ')
          : '',
      );
    } catch {
      if (generation !== pinGeneration.current) return;
      setDetected('');
      setError('Please enter your complete address manually.');
    }
  };
  const locate = async (useSearch = false) => {
    if (locating) return;
    const generation = ++pinGeneration.current;
    setLocating(true);
    setError(undefined);
    try {
      const permission = await ExpoLocation.requestForegroundPermissionsAsync();
      if (generation !== pinGeneration.current) return;
      if (!permission.granted) {
        setError(
          'Location permission is off. Choose a saved address or add one manually.',
        );
        return;
      }
      if (useSearch) {
        const [point] = await ExpoLocation.geocodeAsync(search.trim());
        if (generation !== pinGeneration.current) return;
        if (!point) {
          setError(
            'No matching address found. Try a nearby landmark or add the address manually.',
          );
          return;
        }
        await resolvePin(point);
      } else {
        const result = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
        });
        if (generation !== pinGeneration.current) return;
        draft.setCurrentLocation({
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
        });
        await resolvePin({
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
        });
      }
    } catch {
      setError(
        'We couldn’t find this location. Please choose a saved address or enter one manually.',
      );
    } finally {
      setLocating(false);
    }
  };
  const choose = (address: Address) => {
    ++pinGeneration.current;
    setSelected(address);
    setPin(address.location);
    setDetected(address.address);
  };
  const data =
    query.data?.filter(
      (address) =>
        !search.trim() ||
        `${address.label} ${address.address}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <Header back address={false} />
      <FlatList
        keyboardShouldPersistTaps="handled"
        data={data}
        keyExtractor={(item) => item.address_id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={{ gap: 14 }}>
            <Heading>Select pickup address</Heading>
            <Body>Choose a convenient location for your pickup.</Body>
            <TextInput
              accessibilityLabel="Search area, landmark or address"
              value={search}
              onChangeText={setSearch}
              placeholder="Search area, landmark or enter address"
              style={styles.input}
              returnKeyType="search"
              onSubmitEditing={() => search.trim() && void locate(true)}
            />
            <TextAction
              label="Search this location →"
              onPress={() => {
                if (search.trim()) void locate(true);
              }}
            />
            <Button
              secondary
              label={
                locating ? 'Finding your location…' : 'Use current location →'
              }
              busy={locating}
              onPress={() => void locate()}
            />
            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                overflow: 'hidden',
              }}
            >
              <MapPreview
                location={pin}
                onSelect={(point) => void resolvePin(point)}
              />
              <View style={{ padding: 14 }}>
                <Body>{detected || 'Confirm your pickup location'}</Body>
                {pin && !selected && (
                  <TextAction
                    label="Save this address →"
                    onPress={() => setForm('new')}
                  />
                )}
              </View>
            </View>
            {error && (
              <Body accessibilityRole="alert" style={{ color: colors.error }}>
                {error}
              </Body>
            )}
            {form && (
              <AddressForm
                key={form === 'new' ? 'new' : form.address_id}
                existing={form === 'new' ? undefined : form}
                location={pin}
                initialAddress={detected || search}
                onDone={(saved, archived) => {
                  setForm(null);
                  if (saved) {
                    choose(saved);
                    if (draft.address?.address_id === saved.address_id)
                      draft.selectAddress(saved);
                  } else if (archived && form !== 'new') {
                    if (selected?.address_id === form.address_id)
                      setSelected(null);
                    if (draft.address?.address_id === form.address_id)
                      draft.selectAddress(null);
                  }
                }}
              />
            )}
            <Heading style={{ fontSize: 28, marginTop: 8 }}>
              Saved addresses
            </Heading>
            {query.isLoading && (
              <>
                <Skeleton />
                <Skeleton />
              </>
            )}
            {query.isPending && query.fetchStatus === 'idle' && (
              <StatusCard
                title="Sign in to view saved addresses"
                detail="The design preview does not provide customer addresses."
              />
            )}
            {query.isError && (
              <StatusCard
                title="Unable to load addresses"
                error={query.error}
                retry={() => void query.refetch()}
              />
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ marginTop: 10 }}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{
                checked: selected?.address_id === item.address_id,
              }}
              accessibilityLabel={`${item.label ?? 'Address'}: ${item.address}`}
              onPress={() => choose(item)}
            >
              <Card
                style={{
                  borderColor:
                    selected?.address_id === item.address_id
                      ? colors.gold
                      : colors.border,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  <Ionicons name="home-outline" size={30} color={colors.gold} />
                  <View style={{ flex: 1 }}>
                    <Heading style={{ fontSize: 26, marginBottom: 0 }}>
                      {item.label ?? 'Address'}
                    </Heading>
                    <Body style={{ color: colors.text }}>{item.address}</Body>
                    {item.is_default && <Body>Default address</Body>}
                  </View>
                  <Ionicons
                    name={
                      selected?.address_id === item.address_id
                        ? 'radio-button-on'
                        : 'radio-button-off'
                    }
                    size={24}
                    color={colors.gold}
                  />
                </View>
                <TextAction
                  label="Edit address"
                  onPress={() => setForm(item)}
                />
              </Card>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          !query.isPending && !query.isError ? (
            <StatusCard
              title={
                search ? 'No matching saved addresses' : 'No saved addresses'
              }
              detail="Add your pickup address to get started."
            />
          ) : null
        }
        ListFooterComponent={
          <View style={{ gap: 16, marginTop: 18 }}>
            <Button
              secondary
              label="+ Add new address"
              onPress={() => setForm('new')}
            />
            <Button
              label="Continue →"
              disabled={!selected}
              onPress={() => continueWithAddress()}
            />
          </View>
        }
      />
      <DistanceConfirmation
        distance={distance}
        confirm={() => continueWithAddress(true)}
        chooseAnother={() => setDistance(null)}
      />
    </SafeAreaView>
  );
}
