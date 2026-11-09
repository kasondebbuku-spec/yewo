// Persistence for worker payouts.
import { getDb, now } from '../db.js';

const SELECT = `
  SELECT p.*, u.name AS worker_name, u.phone AS worker_phone, a.name AS agency_name
    FROM payouts p
    JOIN users u ON u.id = p.worker_id
    JOIN workers w ON w.user_id = p.worker_id
    JOIN agencies a ON a.id = w.agency_id`;

// Paid jobs not in any payout yet (the domain decides which are due).
export function unpaidOutJobs(workerId) {
  const sql = `SELECT id, worker_id, status, payment_status, payout_id, worker_payout, completed_at
                 FROM jobs WHERE status = 'completed' AND payment_status = 'paid' AND payout_id IS NULL
                 ${workerId ? 'AND worker_id = ?' : ''} ORDER BY completed_at`;
  return getDb().prepare(sql).all(...(workerId ? [workerId] : []));
}

export const payoutExists = (workerId, periodStart) =>
  !!getDb().prepare('SELECT 1 FROM payouts WHERE worker_id = ? AND period_start = ?').get(workerId, periodStart);

export function insertPayout({ workerId, periodStart, periodEnd, jobs, amount }) {
  const d = getDb();
  const id = Number(
    d.prepare(
      `INSERT INTO payouts (worker_id, period_start, period_end, jobs, amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(workerId, periodStart, periodEnd, jobs.length, amount, now()).lastInsertRowid
  );
  const link = d.prepare('UPDATE jobs SET payout_id = ? WHERE id = ?');
  for (const j of jobs) link.run(id, j.id);
  return id;
}

export const findPayout = (id) => getDb().prepare(`${SELECT} WHERE p.id = ?`).get(Number(id)) ?? null;

export const listPayouts = ({ workerId, status } = {}) => {
  const where = [];
  const args = [];
  if (workerId) { where.push('p.worker_id = ?'); args.push(workerId); }
  if (status) { where.push('p.status = ?'); args.push(status); }
  return getDb()
    .prepare(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.period_start DESC, p.id DESC LIMIT 200`)
    .all(...args);
};

export function markPayoutPaid(id, reference) {
  getDb().prepare("UPDATE payouts SET status = 'paid', reference = ?, paid_at = ? WHERE id = ?").run(reference, now(), id);
  return findPayout(id);
}
