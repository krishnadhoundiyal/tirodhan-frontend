import MapView, { Marker } from 'react-native-maps';
import { View } from 'react-native';
import type { Location } from '../../api/contracts';
import { Body } from '../../components/ui';
import { colors } from '../../theme/tokens';
export default function MapPreview({
  location,
  onSelect,
}: {
  location: Location | null;
  onSelect: (location: Location) => void;
}) {
  if (!location)
    return (
      <View
        style={{
          height: 170,
          backgroundColor: colors.tint,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Body>
          Choose a saved address, search, or use your current location to
          preview the pickup point.
        </Body>
      </View>
    );
  return (
    <MapView
      accessibilityLabel="Pickup location map"
      style={{ height: 190, width: '100%' }}
      region={{ ...location, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
      onPress={(event) => onSelect(event.nativeEvent.coordinate)}
    >
      <Marker
        coordinate={location}
        pinColor={colors.gold}
        draggable
        onDragEnd={(event) => onSelect(event.nativeEvent.coordinate)}
      />
    </MapView>
  );
}
