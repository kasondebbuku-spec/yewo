// Yewo staff screen: verify new workers and watch the key numbers.
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Button, Card, colors, ErrorText, H2, kwacha, Muted, Row, Screen } from '@/components/ui';
import { LogoutButton } from '@/components/LogoutButton';
import { api, errorMessage } from '@/lib/api';
import type { WorkerProfile } from '@/lib/types';

type Stats = {
  customers: number;
  workers: number;
  pendingWorkers: number;
  workersOnline: number;
  jobsCompleted: number;
  gmv: number;
  commission: number;
  avgMinutesToAccept: number | null;
};

export default function AdminHome() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [pending, setPending] = useState<WorkerProfile[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Stats>('/admin/stats').then(setStats).catch((e) => setError(errorMessage(e)));
    api<{ workers: WorkerProfile[] }>('/admin/workers?status=pending').then((r) => setPending(r.workers)).catch(() => {});
  }, []);
  useFocusEffect(load);

  async function decide(id: number, decision: 'verified' | 'rejected') {
    setError('');
    try {
      await api(`/admin/workers/${id}/verify`, { method: 'POST', body: { decision } });
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <LogoutButton /> }} />
      {stats && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Tile label="Paid bookings value" value={kwacha(stats.gmv)} />
          <Tile label="Yewo commission" value={kwacha(stats.commission)} />
          <Tile label="Jobs completed" value={String(stats.jobsCompleted)} />
          <Tile label="Avg. time to accept" value={stats.avgMinutesToAccept == null ? '–' : `${stats.avgMinutesToAccept} min`} />
          <Tile label="Verified workers" value={`${stats.workers} (${stats.workersOnline} online)`} />
          <Tile label="Customers" value={String(stats.customers)} />
        </View>
      )}

      <H2>Workers waiting for verification ({pending.length})</H2>
      {pending.length === 0 && <Muted>No one waiting.</Muted>}
      {pending.map((w) => (
        <Card key={w.id}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{w.name}</Text>
          <Muted>NRC {w.nrc} · {w.phone}</Muted>
          <Muted>Agency: {w.agency.name}{w.agency.phone ? ` (${w.agency.phone})` : ''}</Muted>
          <Muted style={{ fontSize: 12 }}>Check the NRC card and confirm with the agency before approving.</Muted>
          <Row style={{ marginTop: 6 }}>
            <Button title="Reject" variant="danger" style={{ flex: 1 }} onPress={() => decide(w.id, 'rejected')} />
            <Button title="Approve" style={{ flex: 2 }} onPress={() => decide(w.id, 'verified')} />
          </Row>
        </Card>
      ))}
      <ErrorText>{error}</ErrorText>
    </Screen>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card style={{ flexBasis: '47%', flexGrow: 1 }}>
      <Muted style={{ fontSize: 12 }}>{label}</Muted>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{value}</Text>
    </Card>
  );
}
