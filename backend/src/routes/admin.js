// Yewo staff: verify workers' NRC + agency registration, and see how the platform is doing.
import { Router } from 'express';
import { getDb, now } from '../db.js';
import { requireAuth } from '../auth.js';
import { badRequest, notFound } from '../errors.js';
import { workerProfile } from '../jobs.js';

const router = Router();
router.use(requireAuth('admin'));

router.get('/workers', (req, res) => {
  const status = req.query.status;
  const rows = getDb()
    .prepare(`SELECT user_id FROM workers ${status ? 'WHERE verification_status = ?' : ''} ORDER BY user_id DESC`)
    .all(...(status ? [status] : []));
  res.json({ workers: rows.map((r) => workerProfile(r.user_id, { fullNrc: true })) });
});

router.post('/workers/:id/verify', (req, res) => {
  const decision = req.body.decision;
  if (!['verified', 'rejected'].includes(decision)) throw badRequest('decision must be verified or rejected');
  const note = req.body.note ? String(req.body.note).slice(0, 300) : null;

  const result = getDb()
    .prepare(
      `UPDATE workers SET verification_status = ?, verification_note = ?, verified_at = ?,
              is_online = CASE WHEN ? = 'rejected' THEN 0 ELSE is_online END
        WHERE user_id = ?`
    )
    .run(decision, note, decision === 'verified' ? now() : null, decision, Number(req.params.id));
  if (!result.changes) throw notFound('Worker not found');

  res.json({ worker: workerProfile(Number(req.params.id), { fullNrc: true }) });
});

router.get('/stats', (_req, res) => {
  const db = getDb();
  const one = (sql) => db.prepare(sql).get();
  res.json({
    customers: one("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'").n,
    workers: one("SELECT COUNT(*) AS n FROM workers WHERE verification_status = 'verified'").n,
    pendingWorkers: one("SELECT COUNT(*) AS n FROM workers WHERE verification_status = 'pending'").n,
    workersOnline: one('SELECT COUNT(*) AS n FROM workers WHERE is_online = 1').n,
    jobsCompleted: one("SELECT COUNT(*) AS n FROM jobs WHERE status = 'completed'").n,
    gmv: one("SELECT COALESCE(SUM(total), 0) AS n FROM jobs WHERE payment_status = 'paid'").n,
    commission: one("SELECT COALESCE(SUM(commission), 0) AS n FROM jobs WHERE payment_status = 'paid'").n,
    avgMinutesToAccept: one(
      `SELECT ROUND(AVG((julianday(accepted_at) - julianday(created_at)) * 1440), 1) AS n
         FROM jobs WHERE accepted_at IS NOT NULL`
    ).n,
  });
});

export default router;
