// Weekly worker payouts. A payout covers paid jobs finished before the end of a
// Lusaka week (Monday 00:00 to the next Monday). Jobs paid late roll into the next one.
import { addDays, startOfLocalWeek } from './clock.js';
import { clash, invalid } from './errors.js';
import { sumPayouts } from './money.js';

// The last full week before `now`.
export function lastFullWeek(now = new Date()) {
  const end = startOfLocalWeek(now);
  return { start: addDays(end, -7), end };
}

export const nextPayoutDay = (now = new Date()) => addDays(startOfLocalWeek(now), 7);

// Information Expert on which jobs a payout may include.
export const isDue = (job, periodEnd) =>
  job.status === 'completed' &&
  job.payment_status === 'paid' &&
  job.payout_id == null &&
  new Date(job.completed_at) < periodEnd;

// Group due jobs by worker: [{ workerId, jobs, amount }]
export function planPayouts(jobs, periodEnd) {
  const byWorker = new Map();
  for (const j of jobs.filter((x) => isDue(x, periodEnd))) {
    if (!byWorker.has(j.worker_id)) byWorker.set(j.worker_id, []);
    byWorker.get(j.worker_id).push(j);
  }
  return [...byWorker].map(([workerId, list]) => ({ workerId, jobs: list, amount: sumPayouts(list) }));
}

export function checkMarkPaid(payout, reference) {
  if (payout.status === 'paid') throw clash('This payout is already marked as paid');
  const ref = String(reference ?? '').trim();
  if (ref.length < 4) throw invalid('Enter the Mobile Money transaction reference');
  return ref.slice(0, 60);
}
