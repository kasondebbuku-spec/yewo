import { useEffect, useState } from 'react';
import { Switch, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, colors, ErrorText, Field, H1, kwacha, LineItem, Muted, Row, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { DEMO_LOCATION, DEMO_POINTS } from '@/lib/config';
import { getCurrentPoint } from '@/lib/location';
import type { Job, Point, Service } from '@/lib/types';

const URGENCY_FEE = 30; // matches backend config.urgencyFee

export default function Book() {
  const { serviceId } = useLocalSearchParams<{ serviceId: string }>();
  const [service, setService] = useState<Service | null>(null);
  const [address, setAddress] = useState(DEMO_LOCATION ? DEMO_POINTS.customerHome.address : '');
  const [notes, setNotes] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [point, setPoint] = useState<Point | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<{ services: Service[] }>('/services').then((r) =>
      setService(r.services.find((s) => s.id === Number(serviceId)) ?? null)
    );
    getCurrentPoint().then(setPoint).catch((e) => setError(e.message));
  }, [serviceId]);

  async function submit() {
    if (!service || !point) return;
    setError('');
    setLoading(true);
    try {
      const { job } = await api<{ job: Job }>('/jobs', {
        method: 'POST',
        body: { serviceId: service.id, address, notes, urgent, ...point },
      });
      router.replace(`/job/${job.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  }

  if (!service) return <Screen><Muted>Loading…</Muted></Screen>;
  const total = service.base_price + (urgent ? URGENCY_FEE : 0);

  return (
    <Screen>
      <H1>{service.name}</H1>
      <Muted>{service.description}</Muted>

      <Field
        label="Address"
        value={address}
        onChangeText={setAddress}
        placeholder="House number, street, landmark"
        hint={point ? `📍 Using your ${DEMO_LOCATION ? 'demo ' : ''}location for matching` : 'Getting your location…'}
      />
      <Field
        label="Notes for the worker (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="e.g. Gate code, what needs doing, pets"
        multiline
        style={{ minHeight: 70, textAlignVertical: 'top' }}
      />

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>Urgent (priority dispatch)</Text>
          <Switch value={urgent} onValueChange={setUrgent} trackColor={{ true: colors.primary }} />
        </Row>
        <Muted>Adds {kwacha(URGENCY_FEE)}. Your request goes out with an urgent tag.</Muted>
      </Card>

      <Card>
        <LineItem label={service.name} value={kwacha(service.base_price)} />
        {urgent && <LineItem label="Urgency fee" value={kwacha(URGENCY_FEE)} />}
        <LineItem label="Total" value={kwacha(total)} bold />
        <Muted style={{ fontSize: 12 }}>You pay with MTN or Airtel Mobile Money after the job is done.</Muted>
      </Card>

      <ErrorText>{error}</ErrorText>
      <Button title={`Request a worker · ${kwacha(total)}`} onPress={submit} loading={loading} disabled={!address || !point} />
    </Screen>
  );
}
