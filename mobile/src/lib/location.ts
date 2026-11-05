import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { DEMO_POINTS } from './config';
import { isDemo } from './demo';
import type { Point } from './types';

async function ensurePermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Yewo needs your location to find workers near you. Please allow location access.');
  }
}

// Your current position, or a fixed demo point when the demo switch is on.
export async function getCurrentPoint(demoPoint: Point = DEMO_POINTS.customerHome): Promise<Point> {
  if (isDemo()) return { lat: demoPoint.lat, lng: demoPoint.lng };
  await ensurePermission();
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

// Calls onMove every ~25 m. Returns a function that stops watching.
export async function watchPoint(onMove: (p: Point) => void): Promise<() => void> {
  await ensurePermission();
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, distanceInterval: 25 },
    (pos) => onMove({ lat: pos.coords.latitude, lng: pos.coords.longitude })
  );
  return () => sub.remove();
}

// Best-effort street address for a point ("12 Kabulonga Road, Kabulonga"). Empty if unknown.
export async function describePoint(p: Point): Promise<string> {
  if (Platform.OS === 'web') return '';
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng });
    if (!place) return '';
    const street = [place.streetNumber, place.street].filter(Boolean).join(' ');
    return [street || place.name, place.district || place.subregion].filter(Boolean).join(', ');
  } catch {
    return '';
  }
}
