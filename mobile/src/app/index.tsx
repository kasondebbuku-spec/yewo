import { Redirect } from 'expo-router';
import { Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';

// Sends each person to the right home screen.
export default function Index() {
  const { ready, user } = useAuth();
  if (!ready) return <Loading />;
  if (!user) return <Redirect href="/welcome" />;
  if (user.role === 'worker') return <Redirect href="/worker" />;
  if (user.role === 'admin') return <Redirect href="/admin" />;
  return <Redirect href="/customer" />;
}
