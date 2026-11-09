// A compact job card used in lists and home screens.
import { Text } from 'react-native';
import { router } from 'expo-router';
import { Badge, Card, colors, kwacha, Muted, Row } from './ui';
import { formatWhen } from '@/lib/time';
import type { Job, Role } from '@/lib/types';

const LABELS: Record<Job['status'], { customer: string; worker: string; tone: 'primary' | 'success' | 'warn' | 'danger' | 'muted' }> = {
  scheduled: { customer: 'Booked ahead', worker: 'Booked ahead', tone: 'primary' },
  searching: { customer: 'Finding a worker', worker: 'Searching', tone: 'warn' },
  accepted: { customer: 'Worker assigned', worker: 'Accepted', tone: 'primary' },
  en_route: { customer: 'Worker on the way', worker: 'On the way', tone: 'primary' },
  in_progress: { customer: 'Work in progress', worker: 'In progress', tone: 'primary' },
  completed: { customer: 'Completed', worker: 'Completed', tone: 'success' },
  cancelled: { customer: 'Cancelled', worker: 'Cancelled', tone: 'muted' },
  no_workers: { customer: 'No one available', worker: 'No workers', tone: 'danger' },
};

export function statusLabel(job: Job, role: Role) {
  const l = LABELS[job.status];
  return { text: role === 'worker' ? l.worker : l.customer, tone: l.tone };
}

export function JobSummary({ job, role }: { job: Job; role: Role }) {
  const s = statusLabel(job, role);
  const amount = role === 'worker' ? job.workerPayout ?? job.total : job.total;
  return (
    <Card onPress={() => router.push(`/job/${job.id}`)}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{job.service.name}</Text>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{kwacha(amount)}</Text>
      </Row>
      <Muted>
        {job.zone.name} · {job.scheduledFor ? formatWhen(job.scheduledFor) : new Date(job.createdAt).toLocaleDateString()}
        {job.worker && role === 'customer' ? ` · ${job.worker.name}` : ''}
      </Muted>
      <Row>
        <Badge label={s.text} tone={s.tone} />
        {job.status === 'completed' && job.paymentStatus !== 'paid' && <Badge label="Unpaid" tone="danger" />}
      </Row>
    </Card>
  );
}
