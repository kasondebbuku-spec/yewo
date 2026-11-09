// Agency portal: a partner agency sees its own workers, their jobs and any reports,
// and confirms that new sign-ups really work for them.
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Badge, Button, Card, Chip, colors, ErrorText, H1, H2, kwacha, Muted, Row, Screen, Tile } from '@/components/ui';
import { statusLabel } from '@/components/JobSummary';
import { LogoutButton } from '@/components/LogoutButton';
import { useAuth, useSocketEvent } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { formatWhen } from '@/lib/time';
import type { Incident, Job, WorkerProfile } from '@/lib/types';

type Overview = {
  agency: { name: string; area: string | null };
  workers: { total: number; verified: number; pending: number; online: number; rating: number | null };
  thisWeek: { jobs: number; earned: number };
  openReports: number;
};

type AgencyJob = {
  id: number;
  status: Job['status'];
  paymentStatus: Job['paymentStatus'];
  service: string;
  zone: string;
  worker: string;
  workerPayout: number;
  createdAt: string;
  scheduledFor: string | null;
};

type Tab = 'workers' | 'jobs' | 'reports';

export default function AgencyHome() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [workers, setWorkers] = useState<WorkerProfile[]>([]);
  const [jobs, setJobs] = useState<AgencyJob[]>([]);
  const [reports, setReports] = useState<Incident[]>([]);
  const [tab, setTab] = useState<Tab>('workers');
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Overview>('/agency/overview').then(setOverview).catch((e) => setError(errorMessage(e)));
    api<{ workers: WorkerProfile[] }>('/agency/workers').then((r) => setWorkers(r.workers)).catch(() => {});
    api<{ jobs: AgencyJob[] }>('/agency/jobs').then((r) => setJobs(r.jobs)).catch(() => {});
    api<{ reports: Incident[] }>('/agency/reports').then((r) => setReports(r.reports)).catch(() => {});
  }, []);
  useFocusEffect(load);
  useSocketEvent<Incident>('incident:new', load);

  async function confirm(id: number) {
    setBusy(id);
    setError('');
    try {
      await api(`/agency/workers/${id}/confirm`, { method: 'POST' });
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const toConfirm = workers.filter((w) => !w.agencyConfirmed && w.verificationStatus !== 'rejected');
  const urgent = reports.filter((r) => r.urgent && r.status === 'open');

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <LogoutButton /> }} />
      <H1>{user?.agency?.name ?? 'Your agency'}</H1>
      <Muted>Partner portal · signed in as {user?.name}</Muted>

      {urgent.length > 0 && (
        <Card style={{ backgroundColor: colors.dangerSoft, borderColor: '#FECACA' }} onPress={() => setTab('reports')}>
          <H2>🚨 {urgent[0].label}</H2>
          <Muted>
            {urgent[0].reporter.name} on a job with your worker, {urgent[0].job.address}. Yewo staff have been alerted.
          </Muted>
        </Card>
      )}

      {overview && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Tile label="Verified workers" value={`${overview.workers.verified} of ${overview.workers.total}`} />
          <Tile label="Online now" value={String(overview.workers.online)} />
          <Tile label="Jobs this week" value={String(overview.thisWeek.jobs)} />
          <Tile label="Earned by your workers" value={kwacha(overview.thisWeek.earned)} />
          <Tile label="Average rating" value={overview.workers.rating ? `★ ${overview.workers.rating}` : '–'} />
          <Tile label="Open reports" value={String(overview.openReports)} />
        </View>
      )}

      {toConfirm.length > 0 && (
        <>
          <H2>Do these people work for you? ({toConfirm.length})</H2>
          <Muted>They signed up saying they belong to your agency. Yewo checks this before approving them.</Muted>
          {toConfirm.map((w) => (
            <Card key={w.id}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{w.name}</Text>
              <Muted>
                NRC {w.nrc} · {w.phone}
              </Muted>
              <Row>
                <Badge tone={w.photosComplete ? 'success' : 'warn'} label={w.photosComplete ? 'Photos uploaded' : 'Photos missing'} />
                <Badge tone={w.verified ? 'success' : 'warn'} label={w.verified ? 'Verified by Yewo' : 'Awaiting Yewo check'} />
              </Row>
              <Button title="Yes, they work for us" onPress={() => confirm(w.id)} loading={busy === w.id} />
            </Card>
          ))}
        </>
      )}

      <Row>
        <Chip label={`Workers (${workers.length})`} selected={tab === 'workers'} onPress={() => setTab('workers')} />
        <Chip label="Jobs" selected={tab === 'jobs'} onPress={() => setTab('jobs')} />
        <Chip label={`Reports (${reports.length})`} selected={tab === 'reports'} onPress={() => setTab('reports')} />
      </Row>
      <ErrorText>{error}</ErrorText>

      {tab === 'workers' &&
        workers.map((w) => (
          <Card key={w.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 }}>{w.name}</Text>
              <Badge label={w.online ? 'Online' : 'Offline'} tone={w.online ? 'success' : 'muted'} />
            </Row>
            <Muted>
              ★ {w.rating.toFixed(1)} ({w.ratingCount}) · {w.jobsCompleted} jobs · {w.phone}
            </Muted>
            <Row style={{ flexWrap: 'wrap' }}>
              <Badge
                tone={w.verified ? 'success' : w.verificationStatus === 'rejected' ? 'danger' : 'warn'}
                label={w.verified ? '✓ Verified' : w.verificationStatus === 'rejected' ? 'Not approved' : 'Pending check'}
              />
              {w.agencyConfirmed && <Badge tone="success" label="✓ Confirmed by you" />}
            </Row>
          </Card>
        ))}

      {tab === 'jobs' && (
        <>
          {jobs.length === 0 && <Muted>No jobs yet.</Muted>}
          {jobs.map((j) => {
            const s = statusLabel({ status: j.status } as Job, 'worker');
            return (
              <Card key={j.id}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text style={{ fontWeight: '700', color: colors.text, flex: 1 }}>
                    {j.service} · {j.worker}
                  </Text>
                  <Text style={{ fontWeight: '700', color: colors.text }}>{kwacha(j.workerPayout)}</Text>
                </Row>
                <Muted>
                  {j.zone} · {formatWhen(j.scheduledFor ?? j.createdAt)}
                </Muted>
                <Row>
                  <Badge label={s.text} tone={s.tone} />
                  {j.status === 'completed' && (
                    <Badge label={j.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'} tone={j.paymentStatus === 'paid' ? 'success' : 'warn'} />
                  )}
                </Row>
              </Card>
            );
          })}
        </>
      )}

      {tab === 'reports' && (
        <>
          {reports.length === 0 && <Muted>No reports about your workers.</Muted>}
          {reports.map((r) => (
            <Card key={r.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '700', color: r.urgent ? colors.danger : colors.text, flex: 1 }}>{r.label}</Text>
                <Badge label={r.status === 'open' ? 'Open' : 'Closed'} tone={r.status === 'open' ? 'warn' : 'muted'} />
              </Row>
              <Muted>
                By {r.reporter.name} ({r.reporter.role}) · {formatWhen(r.createdAt)} · {r.job.service}
              </Muted>
              {r.description ? <Muted>“{r.description}”</Muted> : null}
              {r.resolution ? <Muted>Yewo: {r.resolution}</Muted> : null}
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
