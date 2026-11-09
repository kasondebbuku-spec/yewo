// Yewo staff screen: verify new workers and watch the key numbers.
import { useCallback, useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { Badge, Button, Card, colors, ErrorText, Field, H2, kwacha, Muted, Row, Screen, Tile } from '@/components/ui';
import { useSocketEvent } from '@/lib/auth';
import { LogoutButton } from '@/components/LogoutButton';
import { api, errorMessage } from '@/lib/api';
import type { Incident, WorkerProfile } from '@/lib/types';

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
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [openReports, setOpenReports] = useState<Incident[]>([]);
  const [viewing, setViewing] = useState<{ url: string; label: string } | null>(null);

  const load = useCallback(() => {
    api<Stats>('/admin/stats').then(setStats).catch((e) => setError(errorMessage(e)));
    api<{ workers: WorkerProfile[] }>('/admin/workers?status=pending').then((r) => setPending(r.workers)).catch(() => {});
    api<{ incidents: Incident[] }>('/admin/incidents?status=open').then((r) => setOpenReports(r.incidents)).catch(() => {});
  }, []);
  useSocketEvent<Incident>('incident:new', load);
  useSocketEvent('worker:agency_confirmed', load);

  const urgent = openReports.filter((r) => r.urgent);
  useFocusEffect(load);

  async function decide(id: number, decision: 'verified' | 'rejected') {
    setError('');
    try {
      await api(`/admin/workers/${id}/verify`, { method: 'POST', body: { decision, note: notes[id] || undefined } });
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <LogoutButton /> }} />
      {urgent.length > 0 && (
        <Card style={{ backgroundColor: colors.dangerSoft, borderColor: '#FECACA' }} onPress={() => router.push('/admin/reports')}>
          <H2>🚨 {urgent.length} urgent report{urgent.length === 1 ? '' : 's'}</H2>
          <Muted>{urgent[0].label}: {urgent[0].reporter.name}, {urgent[0].job.address}. Tap to open.</Muted>
        </Card>
      )}

      <Row style={{ flexWrap: 'wrap' }}>
        <Button title={`Reports (${openReports.length})`} variant="secondary" style={{ flexGrow: 1 }} onPress={() => router.push('/admin/reports')} />
        <Button title="Payouts" variant="secondary" style={{ flexGrow: 1 }} onPress={() => router.push('/admin/payouts')} />
        <Button title="Zones" variant="secondary" style={{ flexGrow: 1 }} onPress={() => router.push('/admin/zones')} />
      </Row>

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
          <Badge
            tone={w.agencyConfirmed ? 'success' : 'warn'}
            label={w.agencyConfirmed ? '✓ Agency confirmed they work there' : 'Agency has not confirmed yet'}
          />
          <Row style={{ gap: 10, marginTop: 6 }}>
            {w.documents?.map((d) => (
              <Pressable
                key={d.kind}
                disabled={!d.url}
                onPress={() => d.url && setViewing({ url: d.url, label: `${w.name}: ${d.label}` })}
                style={{ alignItems: 'center', gap: 4 }}
              >
                <View style={{ width: 84, height: 84, borderRadius: 10, overflow: 'hidden', backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                  {d.url ? <Image source={{ uri: d.url }} style={{ width: 84, height: 84 }} /> : <Muted>Missing</Muted>}
                </View>
                <Muted style={{ fontSize: 11 }}>{d.label}</Muted>
              </Pressable>
            ))}
          </Row>
          {w.documents?.every((d) => d.uploaded) ? (
            <Muted style={{ fontSize: 12 }}>
              Tap a photo to enlarge. Check the name and NRC number match, the selfie matches the NRC photo, and confirm with the agency.
            </Muted>
          ) : (
            <Badge tone="warn" label="Waiting for the worker's photos" />
          )}
          <Field
            label="Reason if rejecting (the worker sees this)"
            value={notes[w.id] ?? ''}
            onChangeText={(t) => setNotes((n) => ({ ...n, [w.id]: t }))}
            placeholder="e.g. NRC photo is blurry, please retake"
          />
          <Row>
            <Button title="Reject" variant="danger" style={{ flex: 1 }} onPress={() => decide(w.id, 'rejected')} />
            <Button
              title="Approve"
              style={{ flex: 2 }}
              disabled={!w.documents?.every((d) => d.uploaded)}
              onPress={() => decide(w.id, 'verified')}
            />
          </Row>
        </Card>
      ))}
      <ErrorText>{error}</ErrorText>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <Pressable
          onPress={() => setViewing(null)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 16, gap: 12 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>{viewing?.label}</Text>
          {viewing && <Image source={{ uri: viewing.url }} style={{ width: '100%', height: '70%' }} resizeMode="contain" />}
          <Text style={{ color: '#D1D5DB', textAlign: 'center' }}>Tap anywhere to close</Text>
        </Pressable>
      </Modal>
    </Screen>
  );
}

