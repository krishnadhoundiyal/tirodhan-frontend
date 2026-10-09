import type { Address, Location } from '../../api/contracts';
// Presentation policy only: approximate straight-line distance, never serviceability or planning.
export const ADDRESS_CONFIRMATION_THRESHOLD_KM = 5;
export function validCoordinate(point: Location) {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180
  );
}
export function approximateDistanceKm(a: Location, b: Location): number | null {
  if (!validCoordinate(a) || !validCoordinate(b)) return null;
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitude = radians(b.latitude - a.latitude),
    longitude = radians(b.longitude - a.longitude);
  const haversine =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(longitude / 2) ** 2;
  return (
    6371 *
    2 *
    Math.atan2(
      Math.sqrt(Math.min(1, haversine)),
      Math.sqrt(Math.max(0, 1 - haversine)),
    )
  );
}
export function addressIdentity(address: Address | null) {
  return address
    ? `${address.address_id}:${address.version}:${address.location?.latitude ?? ''}:${address.location?.longitude ?? ''}`
    : null;
}
export function needsAddressConfirmation(
  address: Address | null,
  current: Location | null,
  confirmed: string | null,
  threshold = ADDRESS_CONFIRMATION_THRESHOLD_KM,
) {
  if (!address?.location || !current || confirmed === addressIdentity(address))
    return null;
  const distance = approximateDistanceKm(current, address.location);
  return distance !== null && distance > threshold ? distance : null;
}
