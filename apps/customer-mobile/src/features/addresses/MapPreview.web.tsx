import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { Map as LeafletMap, Marker, LeafletMouseEvent } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Location } from '../../api/contracts';
import { Body } from '../../components/ui';
import { validCoordinate } from './distance';

// This adapter is browser-only. Native entry points continue to use react-native-maps.
export default function MapPreview({
  location,
  onSelect,
}: {
  location: Location | null;
  onSelect(location: Location): void;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<LeafletMap | null>(null),
    marker = useRef<Marker | null>(null),
    select = useRef(onSelect),
    point = useRef(location);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    select.current = onSelect;
    point.current = location;
  }, [onSelect, location]);
  useEffect(() => {
    let disposed = false;
    void import('leaflet')
      .then((L) => {
        if (disposed || !element.current) return;
        const current =
          point.current && validCoordinate(point.current)
            ? point.current
            : { latitude: 28.6139, longitude: 77.209 };
        const instance = L.map(element.current, {
          scrollWheelZoom: false,
        }).setView([current.latitude, current.longitude], 14);
        map.current = instance;
        L.tileLayer(
          process.env.EXPO_PUBLIC_WEB_MAP_TILE_URL ??
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19,
          },
        ).addTo(instance);
        const icon = L.divIcon({
          html: '<span aria-hidden="true" style="font-size:32px;color:#996b24">●</span>',
          className: '',
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        marker.current = L.marker([current.latitude, current.longitude], {
          icon,
          draggable: true,
          title: 'Pickup pin',
        }).addTo(instance);
        instance.on('click', (event: LeafletMouseEvent) =>
          select.current({
            latitude: event.latlng.lat,
            longitude: event.latlng.lng,
          }),
        );
        marker.current.on('dragend', () => {
          const next = marker.current?.getLatLng();
          if (next) select.current({ latitude: next.lat, longitude: next.lng });
        });
        instance.invalidateSize();
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);
  useEffect(() => {
    if (location && validCoordinate(location)) {
      marker.current?.setLatLng([location.latitude, location.longitude]);
      map.current?.setView([location.latitude, location.longitude]);
    }
  }, [location]);
  return (
    <View>
      <div
        ref={element}
        aria-label="Browser pickup map. Tap to select a pin or drag the pickup marker."
        style={{ height: 230, width: '100%', background: '#eee9df' }}
      />
      {failed && (
        <Body>
          The map couldn’t load. Choose a saved address or enter one manually.
        </Body>
      )}
      <Body style={{ padding: 8, fontSize: 11 }}>
        Browser map preview · Tap or drag the pin. Confirm the complete address
        below.
      </Body>
    </View>
  );
}
