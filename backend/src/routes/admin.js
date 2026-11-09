// Yewo staff: verify workers' NRC + agency registration, and see how the platform is doing.
import { Router } from 'express';
import { getDb, now } from '../db.js';
import { requireAuth } from '../auth.js';
import { badRequest, notFound } from '../errors.js';
import { workerProfile } from '../jobs.js';
import { hasAllDocuments, listDocuments } from '../documents.js';
import { pushToUser } from '../push.js';
import { requireCoords } from '../validation.js';
import { addZone, changeZone, listZonesWithActivity } from '../services/zoneService.js';
import * as incidents from '../services/incidentService.js';
import * as payouts from '../services/payoutService.js';
import { baseUrl } from './workers.js';

const router = Router();
router.use(requireAuth('admin'));

router.get('/workers', (req, res) => {
  const status = req.query.status;
  const rows = getDb()
    .prepare(`SELECT user_id FROM workers ${status ? 'WHERE verification_status = ?' : ''} ORDER BY user_id DESC`)
    .all(...(status ? [status] : []));
  res.json({
    workers: rows.map((r) => ({
      ...workerProfile(r.user_id, { fullNrc: true }),
      documents: listDocuments(r.user_id, baseUrl(req)),
    })),
  });
});

router.post('/workers/:id/verify', (req, res) => {
  const decision = req.body.decision;
  if (!['verified', 'rejected'].includes(decision)) throw badRequest('decision must be verified or rejected');
  const note = req.body.note ? String(req.body.note).slice(0, 300) : null;
  const workerId = Number(req.params.id);
  if (decision === 'verified' && !hasAllDocuments(workerId)) {
    throw badRequest("This worker hasn't uploaded their NRC (front and back) and selfie yet.");
  }

  const result = getDb()
    .prepare(
      `UPDATE workers SET verification_status = ?, verification_note = ?, verified_at = ?,
              is_online = CASE WHEN ? = 'rejected' THEN 0 ELSE is_online END
        WHERE user_id = ?`
    )
    .run(decision, note, decision === 'verified' ? now() : null, decision, workerId);
  if (!result.changes) throw notFound('Worker not found');

  pushToUser(workerId, decision === 'verified'
    ? { title: "You're verified on Yewo", body: 'Go online to start receiving jobs near you.', data: { url: '/worker' } }
    : { title: 'Verification not approved', body: note || 'Please check your NRC photos and upload them again.', data: { url: '/worker' } });

  res.json({ worker: workerProfile(workerId, { fullNrc: true }) });
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

// ---- Zones: open, close, resize or add neighbourhoods ---------------------------
router.get('/zones', (_req, res) => {
  res.json({ zones: listZonesWithActivity() });
});

router.patch('/zones/:id', (req, res) => {
  const { active, radiusKm, name } = req.body;
  res.json({ zone: changeZone(req.params.id, { active, radiusKm, name }) });
});

router.post('/zones', (req, res) => {
  const point = requireCoords(req.body.lat, req.body.lng);
  res.status(201).json({ zone: addZone({ ...point, name: req.body.name, radiusKm: req.body.radiusKm, active: !!req.body.active }) });
});

// ---- Reports and emergencies -------------------------------------------------------
router.get('/incidents', (req, res) => {
  const status = ['open', 'resolved', 'dismissed'].includes(req.query.status) ? req.query.status : undefined;
  res.json({ incidents: incidents.listForStaff({ status }) });
});

router.post('/incidents/:id/resolve', (req, res) => {
  res.json({ incident: incidents.resolve(req.user, req.params.id, req.body) });
});

// ---- Weekly worker payouts -------------------------------------------------------
router.get('/payouts', (req, res) => {
  const status = ['pending', 'paid'].includes(req.query.status) ? req.query.status : undefined;
  res.json({ payouts: payouts.listForStaff({ status }) });
});

router.post('/payouts/run', (_req, res) => {
  res.json(payouts.runWeeklyPayouts());
});

router.post('/payouts/:id/mark-paid', (req, res) => {
  res.json({ payout: payouts.markPaid(req.params.id, req.body.reference) });
});

export default router;
