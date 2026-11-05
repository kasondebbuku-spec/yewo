import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Where the Yewo API lives. Set EXPO_PUBLIC_API_URL in mobile/.env to override.
function defaultApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (Platform.OS === 'web') return 'http://localhost:4000';
  // On a phone running Expo Go, the API runs on the same computer as the Expo dev server.
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:4000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export const API_URL = defaultApiUrl();

// Fixed points used when the demo location switch is on (see lib/demo.ts).
export const DEMO_POINTS = {
  customerHome: { lat: -15.4135, lng: 28.3375, address: 'Plot 12, Kabulonga Road' },
  workerStart: { lat: -15.405, lng: 28.33 },
};
