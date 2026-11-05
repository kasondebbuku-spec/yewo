import * as Location from 'expo-location';
import { DEMO_LOCATION, DEMO_POINTS } from './config';
import type { Point } from './types';

async function ensurePermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Yewo needs your location to find workers near you. Please allow location access.');
  }
}

// Your current position, or a fixed demo point when demo mode is on.
export async function getCurrentPoint(demoFallback: Point = DEMO_POINTS.customerHome): Promise<Point> {
  if (DEMO_LOCATION) return { lat: demoFallback.lat, lng: demoFallback.lng };
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
