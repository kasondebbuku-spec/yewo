import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { listDocuments, saveDocument } from '../documents.js';
import { getDb, now } from '../db.js';
import { requireAuth } from '../auth.js';
import { conflict, forbidden } from '../errors.js';
import { distanceKm, etaMinutes } from '../geo.js';
import { ACTIVE_STATUSES, offerView, round1, workerProfile } from '../jobs.js';
import { emitToUser } from '../realtime.js';
import { requireCoords } from '../validation.js';
import { parseSkills } from './auth.js';
import { workerPayouts } from '../services/payoutService.js';

const router = Router();
router.use(requireAuth('worker'));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } });
export const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;

const activeJobOf = (workerId) =>
  getDb()
    .prepare(
      `SELECT * FROM jobs WHERE worker_id = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`
    )
    .get(workerId, ...ACTIVE_STATUSES);

function saveLocation(workerId, { lat, lng }) {
  getDb()
    .prepare('UPDATE workers SET lat = ?, lng = ?, location_at = ? WHERE user_id = ?')
    .run(lat, lng, now(), workerId);

  // Share live location with the customer while the worker is on the way.
  const job = activeJobOf(workerId);
  if (job && ['accepted', 'en_route'].includes(job.status)) {
    const km = round1(distanceKm({ lat, lng }, job));
    emitToUser(job.customer_id, 'worker:location', {
      jobId: job.id, lat, lng, distanceKm: km, etaMinutes: etaMinutes(km),
    });
  }
}

// Go online (ready for jobs) or offline.
router.patch('/me/status', (req, res) => {
  const online = !!req.body.online;
  const db = getDb();
  const w = db.prepare('SELECT verification_status FROM workers WHERE user_id = ?').get(req.user.id);

  if (online) {
    if (w.verification_status !== 'verified') {
      throw forbidden('Your NRC and agency details are still being checked. You can go online once verified.');
    }
    saveLocation(req.user.id, requireCoords(req.body.lat, req.body.lng));
  } else if (activeJobOf(req.user.id)) {
    throw conflict('Finish your current job before going offline');
  }

  db.prepare('UPDATE workers SET is_online = ? WHERE user_id = ?').run(online ? 1 : 0, req.user.id);
  res.json({ worker: workerProfile(req.user.id, { fullNrc: true }) });
});

router.post('/me/location', (req, res) => {
  saveLocation(req.user.id, requireCoords(req.body.lat, req.body.lng));
  res.json({ ok: true });
});

router.patch('/me/skills', (req, res) => {
  getDb()
    .prepare('UPDATE workers SET skills = ? WHERE user_id = ?')
    .run(JSON.stringify(parseSkills(req.body.skills)), req.user.id);
  res.json({ worker: workerProfile(req.user.id, { fullNrc: true }) });
});

// Offers waiting for this worker's answer.
router.get('/me/offers', (req, res) => {
  const db = getDb();
  const offers = db
    .prepare(
      `SELECT j.*, o.distance_km, o.offered_at FROM job_offers o JOIN jobs j ON j.id = o.job_id
        WHERE o.worker_id = ? AND o.status = 'offered' AND j.status = 'searching'
        ORDER BY o.offered_at DESC`
    )
    .all(req.user.id);
  res.json({ offers: offers.map((row) => offerView(row, row)) });
});

router.get('/me/earnings', (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7)); // Monday

  const sum = (since) =>
    getDb()
      .prepare(
        `SELECT COUNT(*) AS jobs, COALESCE(SUM(worker_payout), 0) AS amount FROM jobs
          WHERE worker_id = ? AND status = 'completed' AND completed_at >= ?`
      )
      .get(req.user.id, since);

  res.json({
    today: sum(startOfDay.toISOString()),
    thisWeek: sum(startOfWeek.toISOString()),
    allTime: sum('0000'),
  });
});

// Money waiting for the next payout day, and past weekly payouts.
router.get('/me/payouts', (req, res) => {
  res.json(workerPayouts(req.user.id));
});

// NRC front, NRC back and selfie for verification.
router.get('/me/documents', (req, res) => {
  res.json({ documents: listDocuments(req.user.id, baseUrl(req)) });
});

router.put('/me/documents/:kind', upload.single('photo'), (req, res) => {
  saveDocument(req.user.id, req.params.kind, req.file?.buffer);
  res.json({ documents: listDocuments(req.user.id, baseUrl(req)) });
});

export default router;
