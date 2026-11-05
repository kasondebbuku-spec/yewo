import { useCallback, useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { Badge, Button, Card, colors, ErrorText, H1, H2, kwacha, Muted, Row, Screen } from '@/components/ui';
import { JobSummary } from '@/components/JobSummary';
import { LogoutButton } from '@/components/LogoutButton';
import { useAuth, useSocketEvent } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { DemoToggle } from '@/components/DemoToggle';
import { DEMO_POINTS } from '@/lib/config';
import { useDemo } from '@/lib/demo';
import { getCurrentPoint, watchPoint } from '@/lib/location';
import { OPEN_STATUSES, type Job, type Offer } from '@/lib/types';

type Earnings = Record<'today' | 'thisWeek' | 'allTime', { jobs: number; amount: number }>;

export default function WorkerHome() {
  const { user, refresh } = useAuth();
  const worker = user?.worker;
  const [offers, setOffers] = useState<Offer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const demo = useDemo();

  const load = useCallback(() => {
    refresh().catch(() => {});
    api<{ offers: Offer[] }>('/workers/me/offers').then((r) => setOffers(r.offers)).catch(() => {});
    api<{ jobs: Job[] }>('/jobs').then((r) => setJobs(r.jobs)).catch(() => {});
    api<Earnings>('/workers/me/earnings').then(setEarnings).catch(() => {});
  }, [refresh]);

  useFocusEffect(load);
  useSocketEvent<Offer>('job:offer', (o) => setOffers((list) => [o, ...list.filter((x) => x.jobId !== o.jobId)]));
  useSocketEvent<{ jobId: number }>('job:offer_closed', ({ jobId }) =>
    setOffers((list) => list.filter((x) => x.jobId !== jobId))
  );
  useSocketEvent<Job>('job:update', load);

  async function setOnline(online: boolean) {
    setError('');
    setBusy('online');
    try {
      const body = online ? { online, ...(await getCurrentPoint(DEMO_POINTS.workerStart)) } : { online };
      await api('/workers/me/status', { method: 'PATCH', body });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function answer(offer: Offer, accept: boolean) {
    setError('');
    setBusy(`${offer.jobId}`);
    try {
      await api(`/jobs/${offer.jobId}/${accept ? 'accept' : 'decline'}`, { method: 'POST' });
      setOffers((list) => list.filter((x) => x.jobId !== offer.jobId));
      if (accept) router.push(`/job/${offer.jobId}`);
    } catch (e) {
      setError(errorMessage(e));
      setOffers((list) => list.filter((x) => x.jobId !== offer.jobId));
    } finally {
      setBusy(null);
    }
  }

  const active = jobs.find((j) => OPEN_STATUSES.includes(j.status));
  const waiting = !!worker?.online && !active;

  // While online and waiting for jobs, keep our position fresh so dispatch finds us.
  useEffect(() => {
    if (!waiting) return;
    const send = (p: { lat: number; lng: number }) =>
      api('/workers/me/location', { method: 'POST', body: p }).catch(() => {});
    if (demo) {
      send(DEMO_POINTS.workerStart);
      return;
    }
    let stop: (() => void) | undefined;
    watchPoint(send).then((s) => (stop = s)).catch((e) => setError(errorMessage(e)));
    return () => stop?.();
  }, [waiting, demo]);

  if (!worker) return null;

  return (
    <Screen>
      <Stack.Screen options={{ headerRight: () => <LogoutButton /> }} />
      <H1>Hi {user.name.split(' ')[0]}</H1>

      {worker.verificationStatus === 'pending' && (
        <Card style={{ backgroundColor: colors.warnSoft, borderColor: '#FDE68A' }}>
          <H2>Verification in progress</H2>
          <Muted>
            We’re checking your NRC with {worker.agency.name}. You can go online and receive jobs once you’re verified.
          </Muted>
        </Card>
      )}
      {worker.verificationStatus === 'rejected' && (
        <Card style={{ backgroundColor: colors.dangerSoft, borderColor: '#FECACA' }}>
          <H2>We couldn’t verify you</H2>
          <Muted>Please contact {worker.agency.name} or Yewo support.</Muted>
        </Card>
      )}

      {worker.verified && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <H2>{worker.online ? "You're online" : "You're offline"}</H2>
              <Muted>{worker.online ? 'Nearby jobs will appear below.' : 'Go online to receive jobs.'}</Muted>
            </View>
            <Switch
              value={worker.online}
              onValueChange={setOnline}
              disabled={busy === 'online'}
              trackColor={{ true: colors.success }}
            />
          </Row>
          <DemoToggle />
        </Card>
      )}
      <ErrorText>{error}</ErrorText>

      {active && (
        <>
          <H2>Current job</H2>
          <JobSummary job={active} role="worker" />
        </>
      )}

      {worker.online && !active && (
        <>
          <H2>New requests</H2>
          {offers.length === 0 && <Muted>Waiting for requests near you…</Muted>}
          {offers.map((o) => (
            <Card key={o.jobId} style={{ borderColor: colors.primary, borderWidth: 2 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{o.service.name}</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colors.success }}>{kwacha(o.workerPayout)}</Text>
              </Row>
              <Row>
                {o.urgent && <Badge label="Urgent" tone="warn" />}
                <Muted>
                  {o.zone.name} · {o.distanceKm} km · ~{o.etaMinutes} min away
                </Muted>
              </Row>
              {o.notes ? <Muted>“{o.notes}”</Muted> : null}
              <Row style={{ marginTop: 6 }}>
                <Button title="Decline" variant="danger" style={{ flex: 1 }} onPress={() => answer(o, false)} disabled={busy === `${o.jobId}`} />
                <Button title="Accept" style={{ flex: 2 }} onPress={() => answer(o, true)} loading={busy === `${o.jobId}`} />
              </Row>
            </Card>
          ))}
        </>
      )}

      {earnings && (
        <Card>
          <H2>Earnings</H2>
          <Row style={{ justifyContent: 'space-between' }}>
            <Stat label="Today" value={kwacha(earnings.today.amount)} sub={jobsLabel(earnings.today.jobs)} />
            <Stat label="This week" value={kwacha(earnings.thisWeek.amount)} sub={jobsLabel(earnings.thisWeek.jobs)} />
            <Stat label="All time" value={kwacha(earnings.allTime.amount)} sub={jobsLabel(earnings.allTime.jobs)} />
          </Row>
        </Card>
      )}

      <Card>
        <H2>Your profile</H2>
        <Row>
          {worker.verified && <Badge label="✓ NRC verified" tone="success" />}
          <Muted>
            ★ {worker.rating.toFixed(1)} ({worker.ratingCount}) · {worker.jobsCompleted} jobs
          </Muted>
        </Row>
        <Muted>Agency: {worker.agency.name}</Muted>
        <Muted>NRC: {worker.nrc}</Muted>
      </Card>

      <Button title="Job history" variant="secondary" onPress={() => router.push('/history')} />
    </Screen>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Muted>{label}</Muted>
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{value}</Text>
      <Muted style={{ fontSize: 12 }}>{sub}</Muted>
    </View>
  );
}

const jobsLabel = (n: number) => `${n} job${n === 1 ? '' : 's'}`;
