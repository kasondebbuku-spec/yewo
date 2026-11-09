// Push notifications (job offers, "worker on the way", payment received...).
//
// They need a development or store build of the app: Expo Go on Android no longer supports
// remote push (since SDK 53), and the web version has none. In those cases everything here
// quietly does nothing, and the app still updates live while it's open.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';
import type { NotificationResponse } from 'expo-notifications';
import { api } from './api';

let currentToken: string | null = null;

export const pushSupported = () =>
  Platform.OS !== 'web' &&
  Device.isDevice &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient; // StoreClient = Expo Go

// Loaded only where it works, so Expo Go doesn't log push warnings.
const notifications = () => import('expo-notifications');

// Ask permission, get this phone's Expo push token and send it to the API.
export async function registerForPush(): Promise<string | null> {
  if (!pushSupported()) return null;
  const N = await notifications();

  if (Platform.OS === 'android') {
    // Android 13+ only shows the permission prompt once a channel exists.
    await N.setNotificationChannelAsync('jobs', {
      name: 'Jobs and bookings',
      importance: N.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  let granted = (await N.getPermissionsAsync()).granted;
  if (!granted) granted = (await N.requestPermissionsAsync()).granted;
  if (!granted) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('Push notifications need an EAS project id. Run `npx eas-cli init` in mobile/.');
    return null;
  }

  const { data: token } = await N.getExpoPushTokenAsync({ projectId });
  await api('/auth/push-token', { method: 'POST', body: { token, platform: Platform.OS } });
  currentToken = token;
  return token;
}

// On logout: stop sending this account's notifications to this phone.
export async function unregisterPush() {
  if (!currentToken) return;
  await api('/auth/push-token/remove', { method: 'POST', body: { token: currentToken } }).catch(() => {});
  currentToken = null;
}

// Show notifications while the app is open, and open the right screen when one is tapped.
export async function listenForPushTaps(): Promise<() => void> {
  if (!pushSupported()) return () => {};
  const N = await notifications();

  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  const open = (response: NotificationResponse | null) => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as Href);
  };

  open(await N.getLastNotificationResponseAsync()); // app was opened by tapping a notification
  const sub = N.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}
