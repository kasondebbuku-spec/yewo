// Weekly payouts to workers (Controller for "run payouts" and "mark payout sent").
// Money is sent by hand from Yewo's MoMo account for now; when the MTN/Airtel
// disbursement APIs are connected, only markPaid's caller changes (Protected Variations).
import { transaction } from '../db.js';
import { lastFullWeek, nextPayoutDay, planPayouts, checkMarkPaid } from '../domain/payout.js';
import { missing } from '../domain/errors.js';
import { sumPayouts } from '../domain/money.js';
import { mobileNetwork } from '../validation.js';
import { findPayout, insertPayout, listPayouts, markPayoutPaid, payoutExists, unpaidOutJobs } from '../repos/payoutRepo.js';
import { tell } from './notifier.js';

export function payoutView(p) {
  return {
    id: p.id,
    worker: { id: p.worker_id, name: p.worker_name, phone: p.worker_phone, network: mobileNetwork(p.worker_phone) },
    agency: p.agency_name,
    periodStart: p.period_start,
    periodEnd: p.period_end,
    jobs: p.jobs,
    amount: p.amount,
    status: p.status,
    reference: p.reference,
    paidAt: p.paid_at,
  };
}

// Create one payout per worker for last week's paid jobs. Safe to run twice.
export function runWeeklyPayouts(now = new Date()) {
  const { start, end } = lastFullWeek(now);
  const plans = planPayouts(unpaidOutJobs(), end);
  const ids = [];
  transaction(() => {
    for (const p of plans) {
      if (payoutExists(p.workerId, start.toISOString())) continue;
      ids.push(insertPayout({ ...p, periodStart: start.toISOString(), periodEnd: end.toISOString() }));
    }
  });

  const payouts = ids.map((id) => payoutView(findPayout(id)));
  for (const p of payouts) {
    tell(p.worker.id, {
      push: {
        title: 'Your weekly payout is ready',
        body: `K${p.amount} for ${p.jobs} job${p.jobs === 1 ? '' : 's'}. We'll send it to your Mobile Money.`,
        data: { url: '/worker/payouts' },
      },
    });
  }
  return { periodStart: start.toISOString(), periodEnd: end.toISOString(), payouts };
}

export function markPaid(id, reference) {
  const payout = findPayout(id);
  if (!payout) throw missing('Payout not found');
  const ref = checkMarkPaid(payout, reference);
  const view = payoutView(markPayoutPaid(payout.id, ref));
  tell(view.worker.id, {
    push: { title: 'Payout sent', body: `K${view.amount} sent to ${view.worker.phone} (ref ${ref}).`, data: { url: '/worker/payouts' } },
  });
  return view;
}

// What a worker sees: money waiting for the next payout day, and past payouts.
export function workerPayouts(workerId, now = new Date()) {
  const waiting = unpaidOutJobs(workerId);
  return {
    upcoming: { jobs: waiting.length, amount: sumPayouts(waiting), payoutDay: nextPayoutDay(now).toISOString() },
    payouts: listPayouts({ workerId }).map(payoutView),
  };
}

export const listForStaff = ({ status } = {}) => listPayouts({ status }).map(payoutView);
