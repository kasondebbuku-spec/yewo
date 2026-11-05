// One booking, seen by either the customer or the worker. Updates live.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Badge, Button, Card, colors, ErrorText, Field, H1, H2, kwacha, LineItem, Loading, Muted, Row, Screen, Stars,
} from '@/components/ui';
import { statusLabel } from '@/components/JobSummary';
import { useAuth, useSocketEvent } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { JobMap } from '@/components/Map';
import { DEMO_POINTS } from '@/lib/config';
import { isDemo } from '@/lib/demo';
import { getCurrentPoint, watchPoint } from '@/lib/location';
import type { Job, Point } from '@/lib/types';

type LiveLocation = { jobId: number; lat: number; lng: number; distanceKm: number; etaMinutes: number };

const ON_JOB = ['accepted', 'en_route', 'in_progress'];

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [live, setLive] = useState<LiveLocation | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ job: Job }>(`/jobs/${id}`).then((r) => setJob(r.job)).catch((e) => setError(errorMessage(e)));
  }, [id]);

  useEffect(load, [load]);

  useSocketEvent<Job>('job:update', (j) => {
    if (j.id === Number(id)) setJob(j);
  });
  useSocketEvent<LiveLocation>('worker:location', (l) => {
    if (l.jobId === Number(id)) setLive(l);
  });

  // Run a job action (accept, check in, pay, ...) and show the result.
  async function act(name: string, path: string, body?: object) {
    setError('');
    setBusy(name);
    try {
      const r = await api<{ job?: Job }>(`/jobs/${id}/${path}`, { method: 'POST', body: body ?? {} });
      if (r.job) setJob(r.job);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (!job || !user) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  const isWorker = user.role === 'worker';
  const status = statusLabel(job, user.role);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <H1>{job.service.name}</H1>
        {job.urgent && <Badge label="Urgent" tone="warn" />}
      </Row>
      <Row>
        <Badge label={status.text} tone={status.tone} />
        <Muted>{job.zone.name}</Muted>
      </Row>

      {isWorker ? (
        <WorkerView job={job} act={act} busy={busy} />
      ) : (
        <CustomerView job={job} live={live} act={act} busy={busy} />
      )}

      <ErrorText>{error}</ErrorText>
      <Timeline job={job} />
    </Screen>
  );
}

type ActFn = (name: string, path: string, body?: object) => Promise<boolean>;

// ---------------------------------------------------------------- customer side
function CustomerView({ job, live, act, busy }: { job: Job; live: LiveLocation | null; act: ActFn; busy: string | null }) {
  const { user } = useAuth();
  const [payPhone, setPayPhone] = useState(user?.phone ?? '');
  const eta = live?.etaMinutes ?? job.worker?.etaMinutes;
  const distance = live?.distanceKm ?? job.worker?.distanceKm;
  const workerPoint = live ? { lat: live.lat, lng: live.lng } : job.worker?.location ?? null;

  return (
    <>
      {job.worker && ON_JOB.includes(job.status) && (
        <JobMap home={job.location} worker={workerPoint} workerLabel={job.worker.name} />
      )}

      {job.status === 'searching' && (
        <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <H2>Finding a verified worker near you…</H2>
          <Muted style={{ textAlign: 'center' }}>We’ve sent your request to the closest available workers.</Muted>
        </Card>
      )}

      {job.status === 'no_workers' && (
        <Card>
          <H2>No one was free just now</H2>
          <Muted>All nearby workers are busy. Try again in a few minutes.</Muted>
          <Button title="Try again" onPress={() => act('retry', 'retry')} loading={busy === 'retry'} />
        </Card>
      )}

      {job.worker && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <H2>{job.worker.name}</H2>
            <Badge label="✓ NRC verified" tone="success" />
          </Row>
          <Row>
            <Stars value={Math.round(job.worker.rating)} size={16} />
            <Muted>
              {job.worker.rating.toFixed(1)} ({job.worker.ratingCount}) · {job.worker.jobsCompleted} jobs done
            </Muted>
          </Row>
          <Muted>Agency: {job.worker.agency.name}</Muted>
          <Muted>NRC: {job.worker.nrc}</Muted>
          {['accepted', 'en_route'].includes(job.status) && eta != null && (
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary, marginTop: 4 }}>
              {job.status === 'en_route' ? 'On the way' : 'Getting ready'} · about {eta} min ({distance} km away)
            </Text>
          )}
          {job.status === 'in_progress' && (
            <Text style={{ fontWeight: '700', color: colors.success }}>
              Checked in at {time(job.checkedInAt)}
            </Text>
          )}
          {!['completed', 'cancelled'].includes(job.status) && (
            <Row style={{ marginTop: 6 }}>
              <Button title="Call worker" variant="secondary" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${job.worker!.phone}`)} />
              {job.worker.agency.phone && (
                <Button title="Call agency" variant="secondary" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${job.worker!.agency.phone}`)} />
              )}
            </Row>
          )}
        </Card>
      )}

      <Card>
        <Muted>{job.address}</Muted>
        {job.notes ? <Muted>“{job.notes}”</Muted> : null}
        <LineItem label={job.service.name} value={kwacha(job.price)} />
        {job.urgencyFee > 0 && <LineItem label="Urgency fee" value={kwacha(job.urgencyFee)} />}
        <LineItem label="Total" value={kwacha(job.total)} bold />
      </Card>

      {job.status === 'completed' && (
        <Card>
          <H2>Payment</H2>
          {job.paymentStatus === 'paid' && (
            <>
              <Badge label={`✓ Paid with ${job.payment?.provider === 'mtn' ? 'MTN MoMo' : 'Airtel Money'}`} tone="success" />
              <Muted>Ref {job.payment?.reference}</Muted>
            </>
          )}
          {job.paymentStatus === 'pending' && (
            <Row>
              <ActivityIndicator color={colors.primary} />
              <Muted>Check your phone ({job.payment?.phone}) and approve the payment with your MoMo PIN.</Muted>
            </Row>
          )}
          {['unpaid', 'failed'].includes(job.paymentStatus) && (
            <>
              {job.paymentStatus === 'failed' && <ErrorText>The payment didn’t go through. Please try again.</ErrorText>}
              <Field label="MTN or Airtel number" value={payPhone} onChangeText={setPayPhone} keyboardType="phone-pad" />
              <Button
                title={`Pay ${kwacha(job.total)} with Mobile Money`}
                onPress={() => act('pay', 'pay', { phone: payPhone })}
                loading={busy === 'pay'}
              />
            </>
          )}
        </Card>
      )}

      {job.status === 'completed' && job.worker && (
        <RateCard
          title={`How was ${job.worker.name.split(' ')[0]}?`}
          existing={job.customerRating}
          onSubmit={(stars, comment) => act('rate', 'rate', { stars, comment })}
          busy={busy === 'rate'}
        />
      )}

      {['searching', 'accepted', 'en_route'].includes(job.status) && (
        <Button title="Cancel booking" variant="danger" onPress={() => act('cancel', 'cancel')} loading={busy === 'cancel'} />
      )}
      {['completed', 'cancelled'].includes(job.status) && (
        <Button title="Back to home" variant="ghost" onPress={() => router.replace('/')} />
      )}
    </>
  );
}

// ------------------------------------------------------------------ worker side
function WorkerView({ job, act, busy }: { job: Job; act: ActFn; busy: string | null }) {
  useShareLocation(job);
  const [gpsError, setGpsError] = useState('');

  async function checkIn() {
    // In demo mode we pretend the worker is standing at the customer's gate.
    setGpsError('');
    let here: Point;
    try {
      here = isDemo() ? job.location : await getCurrentPoint();
    } catch (e) {
      setGpsError(errorMessage(e));
      return;
    }
    await act('check-in', 'check-in', here);
  }

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${job.location.lat},${job.location.lng}`;

  return (
    <>
      {ON_JOB.includes(job.status) && (
        <JobMap home={job.location} worker={job.worker?.location ?? null} workerLabel="You" showMe={!isDemo()} />
      )}
      <Card>
        <H2>{job.customer?.name}</H2>
        <Muted>{job.address}</Muted>
        {job.notes ? <Muted>“{job.notes}”</Muted> : null}
        {['accepted', 'en_route', 'in_progress'].includes(job.status) && (
          <Row style={{ marginTop: 6 }}>
            <Button title="Call" variant="secondary" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${job.customer?.phone}`)} />
            <Button title="Directions" variant="secondary" style={{ flex: 1 }} onPress={() => Linking.openURL(mapsUrl)} />
          </Row>
        )}
      </Card>

      <Card>
        <LineItem label="Customer pays" value={kwacha(job.total)} />
        <LineItem label="Yewo fee (15%)" value={`−${kwacha(job.commission ?? 0)}`} />
        <LineItem label="You earn" value={kwacha(job.workerPayout ?? 0)} bold />
        {job.status === 'completed' && (
          <Badge
            label={job.paymentStatus === 'paid' ? '✓ Customer has paid' : 'Waiting for customer payment'}
            tone={job.paymentStatus === 'paid' ? 'success' : 'warn'}
          />
        )}
      </Card>

      {job.status === 'accepted' && (
        <Button title="I'm on my way" onPress={() => act('en-route', 'en-route')} loading={busy === 'en-route'} />
      )}
      {['accepted', 'en_route'].includes(job.status) && (
        <>
          <Button title="I've arrived · Check in" variant={job.status === 'en_route' ? 'primary' : 'secondary'} onPress={checkIn} loading={busy === 'check-in'} />
          <ErrorText>{gpsError}</ErrorText>
          <Button title="I can't make it" variant="danger" onPress={async () => (await act('release', 'release')) && router.replace('/')} loading={busy === 'release'} />
        </>
      )}
      {job.status === 'in_progress' && (
        <Card>
          <Text style={{ fontWeight: '700', color: colors.success }}>Checked in at {time(job.checkedInAt)}</Text>
          <Button title="Job finished · Check out" onPress={() => act('check-out', 'check-out')} loading={busy === 'check-out'} />
        </Card>
      )}
      {job.status === 'completed' && (
        <RateCard
          title={`Rate ${job.customer?.name.split(' ')[0]}`}
          existing={job.workerRating}
          onSubmit={(stars, comment) => act('rate', 'rate', { stars, comment })}
          busy={busy === 'rate'}
        />
      )}
      {['completed', 'cancelled'].includes(job.status) && (
        <Button title="Back to home" variant="ghost" onPress={() => router.replace('/')} />
      )}
    </>
  );
}

// While a worker is heading to a job, keep sending their position so the customer can follow.
function useShareLocation(job: Job) {
  const tracking = ['accepted', 'en_route'].includes(job.status);
  const step = useRef(0);

  useEffect(() => {
    if (!tracking) return;
    const send = (p: Point) => api('/workers/me/location', { method: 'POST', body: p }).catch(() => {});

    if (isDemo()) {
      // Demo: glide from a nearby start point to the customer's door.
      if (job.status !== 'en_route') return;
      const from = DEMO_POINTS.workerStart;
      const steps = 12;
      const timer = setInterval(() => {
        step.current = Math.min(step.current + 1, steps);
        const t = step.current / steps;
        send({ lat: from.lat + (job.location.lat - from.lat) * t, lng: from.lng + (job.location.lng - from.lng) * t });
      }, 2500);
      return () => clearInterval(timer);
    }

    let stop: (() => void) | undefined;
    watchPoint(send).then((s) => (stop = s)).catch(() => {});
    return () => stop?.();
  }, [tracking, job.status, job.location.lat, job.location.lng]);
}

// ------------------------------------------------------------------ shared bits
function RateCard({
  title, existing, onSubmit, busy,
}: {
  title: string;
  existing: { stars: number; comment: string | null } | null;
  onSubmit: (stars: number, comment: string) => void;
  busy: boolean;
}) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');

  if (existing) {
    return (
      <Card>
        <H2>Your rating</H2>
        <Stars value={existing.stars} size={22} />
        {existing.comment ? <Muted>“{existing.comment}”</Muted> : null}
      </Card>
    );
  }
  return (
    <Card>
      <H2>{title}</H2>
      <Stars value={stars} onChange={setStars} />
      <Field label="Comment (optional)" value={comment} onChangeText={setComment} placeholder="Anything we should know?" />
      <Button title="Submit rating" onPress={() => onSubmit(stars, comment)} disabled={!stars} loading={busy} />
    </Card>
  );
}

function Timeline({ job }: { job: Job }) {
  const steps: [string, string | null][] = [
    ['Requested', job.createdAt],
    ['Worker accepted', job.acceptedAt],
    ['On the way', job.enRouteAt],
    ['Checked in', job.checkedInAt],
    ['Checked out', job.completedAt],
    ['Cancelled', job.cancelledAt],
  ];
  const shown = steps.filter(([, at]) => at);
  return (
    <View style={{ gap: 4, marginTop: 6 }}>
      {shown.map(([label, at]) => (
        <Row key={label} style={{ justifyContent: 'space-between' }}>
          <Muted>{label}</Muted>
          <Muted>{time(at)}</Muted>
        </Row>
      ))}
    </View>
  );
}

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
