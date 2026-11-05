import { useCallback, useEffect, useState } from 'react';
import { Text } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { Badge, Button, Card, colors, H1, H2, kwacha, Muted, Row, Screen } from '@/components/ui';
import { JobSummary } from '@/components/JobSummary';
import { LogoutButton } from '@/components/LogoutButton';
import { useAuth, useSocketEvent } from '@/lib/auth';
import { api } from '@/lib/api';
import { DEMO_LOCATION } from '@/lib/config';
import { getCurrentPoint } from '@/lib/location';
import { OPEN_STATUSES, type Job, type Service } from '@/lib/types';

type ZoneCheck = { zone: { name: string; active: boolean } | null; available: boolean };

export default function CustomerHome() {
  const { user } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [zone, setZone] = useState<ZoneCheck | null>(null);
  const [zoneError, setZoneError] = useState('');

  const loadJobs = useCallback(() => {
    api<{ jobs: Job[] }>('/jobs').then((r) => setJobs(r.jobs)).catch(() => {});
  }, []);

  useEffect(() => {
    api<{ services: Service[] }>('/services').then((r) => setServices(r.services)).catch(() => {});
    getCurrentPoint()
      .then((p) => api<ZoneCheck>(`/zones/detect?lat=${p.lat}&lng=${p.lng}`))
      .then(setZone)
      .catch((e) => setZoneError(e.message));
  }, []);

  useFocusEffect(loadJobs);
  useSocketEvent<Job>('job:update', loadJobs);

  const active = jobs.find((j) => OPEN_STATUSES.includes(j.status));
  const unpaid = jobs.find((j) => j.status === 'completed' && j.paymentStatus !== 'paid');

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <LogoutButton /> }} />
      <H1>Hi {user?.name.split(' ')[0]} 👋</H1>

      {zone && (
        <Row>
          <Badge
            tone={zone.available ? 'success' : 'warn'}
            label={
              zone.available
                ? `📍 ${zone.zone?.name}: Yewo is available`
                : zone.zone
                  ? `📍 ${zone.zone.name}: coming soon`
                  : '📍 Yewo is not in your area yet'
            }
          />
          {DEMO_LOCATION && <Badge tone="muted" label="Demo location" />}
        </Row>
      )}
      {zoneError ? <Muted>{zoneError}</Muted> : null}

      {active && (
        <>
          <H2>Current booking</H2>
          <JobSummary job={active} role="customer" />
        </>
      )}
      {!active && unpaid && (
        <>
          <H2>Waiting for payment</H2>
          <JobSummary job={unpaid} role="customer" />
        </>
      )}

      <H2>What do you need help with?</H2>
      {services.map((s) => (
        <Card
          key={s.id}
          onPress={active ? undefined : () => router.push({ pathname: '/customer/book', params: { serviceId: s.id } })}
          style={active ? { opacity: 0.5 } : undefined}
        >
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{s.name}</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.primary }}>{kwacha(s.base_price)}</Text>
          </Row>
          <Muted>{s.description}</Muted>
        </Card>
      ))}
      {active && <Muted>You can book again once your current booking is finished.</Muted>}

      <Button title="Past bookings" variant="secondary" onPress={() => router.push('/history')} />
    </Screen>
  );
}
