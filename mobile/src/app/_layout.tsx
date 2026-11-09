import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/components/ui';
import { AuthProvider } from '@/lib/auth';
import { listenForPushTaps } from '@/lib/push';

// Opens the right screen when someone taps a notification.
function PushTapHandler() {
  useEffect(() => {
    let stop: (() => void) | undefined;
    listenForPushTaps().then((s) => (stop = s)).catch(() => {});
    return () => stop?.();
  }, []);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <PushTapHandler />
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerTintColor: colors.primary,
            headerStyle: { backgroundColor: colors.bg },
            headerTitleStyle: { color: colors.text, fontWeight: '700' },
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ title: 'Create account' }} />
          <Stack.Screen name="forgot-pin" options={{ title: 'Forgot PIN' }} />
          <Stack.Screen name="customer/index" options={{ title: 'Yewo', headerBackVisible: false }} />
          <Stack.Screen name="customer/book" options={{ title: 'Book a worker' }} />
          <Stack.Screen name="worker/index" options={{ title: 'Yewo Worker', headerBackVisible: false }} />
          <Stack.Screen name="admin/index" options={{ title: 'Yewo Admin', headerBackVisible: false }} />
          <Stack.Screen name="job/[id]" options={{ title: 'Booking' }} />
          <Stack.Screen name="history" options={{ title: 'Past bookings' }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
