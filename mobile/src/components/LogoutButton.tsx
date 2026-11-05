import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { colors } from './ui';
import { useAuth } from '@/lib/auth';

export function LogoutButton() {
  const { logout } = useAuth();
  return (
    <Pressable
      hitSlop={8}
      onPress={async () => {
        await logout();
        router.replace('/welcome');
      }}
    >
      <Text style={{ color: colors.primary, fontWeight: '600' }}>Log out</Text>
    </Pressable>
  );
}
