import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/components/ui';
import { AuthProvider } from '@/lib/auth';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
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
