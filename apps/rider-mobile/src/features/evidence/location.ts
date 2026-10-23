import * as Location from 'expo-location';
import { ApiError } from '../../api/errors';
export async function measuredLocation(current: () => void) {
  current();
  if (!(await Location.requestForegroundPermissionsAsync()).granted)
    throw new ApiError(0, 'configuration');
  current();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new ApiError(0, 'network')), 20000);
      }),
    ]);
    current();
    const { latitude, longitude, accuracy } = position.coords;
    if (
      position.mocked ||
      !Number.isFinite(position.timestamp) ||
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180 ||
      accuracy === null ||
      !Number.isFinite(accuracy) ||
      accuracy > 50 ||
      accuracy < 0 ||
      Date.now() - position.timestamp > 30000 ||
      position.timestamp > Date.now() + 5000
    )
      throw new ApiError(0, 'configuration');
    return { latitude, longitude };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
