// The booking lifecycle:
//
//   searching -> accepted -> en_route -> in_progress (checked in) -> completed -> paid & rated
//        |            |          |
//        |            +----------+--> back to searching if the worker drops it
//        +--> no_workers (customer can retry)       customer can cancel until check-in
import { Router } from 'express';
import { config } from '../config.js';
import { getDb, now, transaction } from '../db.js';
import { requireAuth } from '../auth.js';
import { badRequest, conflict, forbidden } from '../errors.js';
import { detectZone, distanceKm } from '../geo.js';
import { ACTIVE_STATUSES, jobView, loadJob, loadJobFor, notifyJob, round2 } from '../jobs.js';
import { onOfferDeclined, redispatch, startDispatch, stopDispatch } from '../dispatch.js';
import { requestPayment } from '../payments/index.js';
import { mobileNetwork, normalizePhone, requireCoords, requireText } from '../validation.js';

const router = Router();
router.use(requireAuth());

const placeholders = (arr) => arr.map(() => '?').join(',');

function requireRole(req, role) {
  if (req.user.role !== role) throw forbidden(`Only ${role}s can do this`);
}

function requireAssignedWorker(req) {
  requireRole(req, 'worker');
  const job = loadJobFor(req.params.id, req.user);
  if (job.worker_id !== req.user.id) throw forbidden('This is not your job');
  return job;
}

// Move a job from one of `from` to `to`, refusing if it is in any other state.
function setStatus(jobId, from, to, extra = {}) {
  const cols = Object.keys(extra);
  const sets = ['status = ?', ...cols.map((c) => `${c} = ?`)].join(', ');
  const result = getDb()
    .prepare(`UPDATE jobs SET ${sets} WHERE id = ? AND status IN (${placeholders(from)})`)
    .run(to, ...Object.values(extra), jobId, ...from);
  if (!result.changes) throw conflict(`This job can't be changed to "${to}" right now`);
}

const respond = (res, jobId, user) => res.json({ job: jobView(loadJob(jobId), user) });

// ---- Customer books a service -------------------------------------------------
router.post('/', (req, res) => {
  requireRole(req, 'customer');
  const db = getDb();

  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(Number(req.body.serviceId));
  if (!service) throw badRequest('Choose a service');
  const address = requireText(req.body.address, 'Address', 200);
  const point = requireCoords(req.body.lat, req.body.lng);
  const notes = req.body.notes ? String(req.body.notes).trim().slice(0, 500) : null;
  const urgent = !!req.body.urgent;

  const zone = detectZone(point);
  if (!zone) {
    const names = db.prepare('SELECT name FROM zones WHERE active = 1').all().map((z) => z.name);
    throw badRequest(`Yewo isn't available at this address yet. We currently serve ${names.join(', ')}.`);
  }

  const open = db
    .prepare(`SELECT id FROM jobs WHERE customer_id = ? AND status IN (${placeholders(['searching', ...ACTIVE_STATUSES])})`)
    .get(req.user.id, 'searching', ...ACTIVE_STATUSES);
  if (open) throw conflict('You already have a booking in progress');

  const urgencyFee = urgent ? config.urgencyFee : 0;
  const total = service.base_price + urgencyFee;
  const commission = round2(total * config.commissionRate);

  const result = db
    .prepare(
      `INSERT INTO jobs (customer_id, service_id, zone_id, address, lat, lng, notes, urgent,
                         price, urgency_fee, total, commission, worker_payout, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.id, service.id, zone.id, address, point.lat, point.lng, notes, urgent ? 1 : 0,
         service.base_price, urgencyFee, total, commission, round2(total - commission), now());

  const jobId = Number(result.lastInsertRowid);
  startDispatch(jobId);
  res.status(201).json({ job: jobView(loadJob(jobId), req.user) });
});

// ---- Lists and details --------------------------------------------------------
router.get('/', (req, res) => {
  const db = getDb();
  const rows =
    req.user.role === 'admin'
      ? db.prepare('SELECT * FROM jobs ORDER BY id DESC LIMIT 100').all()
      : db
          .prepare(`SELECT * FROM jobs WHERE ${req.user.role === 'worker' ? 'worker_id' : 'customer_id'} = ? ORDER BY id DESC LIMIT 50`)
          .all(req.user.id);
  res.json({ jobs: rows.map((j) => jobView(j, req.user)) });
});

router.get('/:id', (req, res) => {
  res.json({ job: jobView(loadJobFor(req.params.id, req.user), req.user) });
});

// ---- Worker answers an offer ---------------------------------------------------
router.post('/:id/accept', (req, res) => {
  requireRole(req, 'worker');
  const jobId = Number(req.params.id);

  transaction((db) => {
    const offer = db
      .prepare("SELECT 1 FROM job_offers WHERE job_id = ? AND worker_id = ? AND status = 'offered'")
      .get(jobId, req.user.id);
    if (!offer) throw conflict('This job is no longer available');

    const busy = db
      .prepare(`SELECT 1 FROM jobs WHERE worker_id = ? AND status IN (${placeholders(ACTIVE_STATUSES)})`)
      .get(req.user.id, ...ACTIVE_STATUSES);
    if (busy) throw conflict('Finish your current job first');

    // Only succeeds for the first worker to accept.
    const taken = db
      .prepare("UPDATE jobs SET worker_id = ?, status = 'accepted', accepted_at = ? WHERE id = ? AND status = 'searching'")
      .run(req.user.id, now(), jobId);
    if (!taken.changes) throw conflict('Another worker already took this job');

    db.prepare("UPDATE job_offers SET status = 'accepted' WHERE job_id = ? AND worker_id = ?").run(jobId, req.user.id);
  });

  stopDispatch(jobId);
  notifyJob(jobId, 'accepted');
  respond(res, jobId, req.user);
});

router.post('/:id/decline', (req, res) => {
  requireRole(req, 'worker');
  const jobId = Number(req.params.id);
  const result = getDb()
    .prepare("UPDATE job_offers SET status = 'declined' WHERE job_id = ? AND worker_id = ? AND status = 'offered'")
    .run(jobId, req.user.id);
  if (result.changes) onOfferDeclined(jobId);
  res.json({ ok: true });
});

// Worker can no longer make it: put the job back up for other workers.
router.post('/:id/release', (req, res) => {
  const job = requireAssignedWorker(req);
  transaction((db) => {
    setStatus(job.id, ['accepted', 'en_route'], 'searching', {
      worker_id: null, accepted_at: null, en_route_at: null,
    });
    db.prepare("UPDATE job_offers SET status = 'declined' WHERE job_id = ? AND worker_id = ?").run(job.id, req.user.id);
  });
  notifyJob(job.id, 'released');
  redispatch(job.id);
  res.json({ ok: true });
});

// ---- Worker progress -----------------------------------------------------------
router.post('/:id/en-route', (req, res) => {
  const job = requireAssignedWorker(req);
  setStatus(job.id, ['accepted'], 'en_route', { en_route_at: now() });
  notifyJob(job.id, 'en_route');
  respond(res, job.id, req.user);
});

router.post('/:id/check-in', (req, res) => {
  const job = requireAssignedWorker(req);
  const here = requireCoords(req.body.lat, req.body.lng);
  const meters = Math.round(distanceKm(here, job) * 1000);
  if (meters > config.checkInRadiusM) {
    throw badRequest(`You need to be at the customer's address to check in (you are ${meters} m away).`);
  }
  setStatus(job.id, ['accepted', 'en_route'], 'in_progress', {
    checked_in_at: now(), check_in_distance_m: meters,
  });
  notifyJob(job.id, 'checked_in');
  respond(res, job.id, req.user);
});

router.post('/:id/check-out', (req, res) => {
  const job = requireAssignedWorker(req);
  transaction((db) => {
    setStatus(job.id, ['in_progress'], 'completed', { completed_at: now() });
    db.prepare('UPDATE workers SET jobs_completed = jobs_completed + 1 WHERE user_id = ?').run(req.user.id);
  });
  notifyJob(job.id, 'completed');
  respond(res, job.id, req.user);
});

// ---- Customer actions ----------------------------------------------------------
router.post('/:id/cancel', (req, res) => {
  requireRole(req, 'customer');
  const job = loadJobFor(req.params.id, req.user);
  const reason = req.body.reason ? String(req.body.reason).slice(0, 200) : null;
  setStatus(job.id, ['searching', 'accepted', 'en_route', 'no_workers'], 'cancelled', {
    cancelled_at: now(), cancel_reason: reason,
  });
  stopDispatch(job.id);
  notifyJob(job.id, 'cancelled');
  respond(res, job.id, req.user);
});

// Nobody was free last time: try again.
router.post('/:id/retry', (req, res) => {
  requireRole(req, 'customer');
  const job = loadJobFor(req.params.id, req.user);
  transaction((db) => {
    setStatus(job.id, ['no_workers'], 'searching', { dispatch_wave: 0 });
    db.prepare('DELETE FROM job_offers WHERE job_id = ?').run(job.id);
  });
  startDispatch(job.id);
  respond(res, job.id, req.user);
});

router.post('/:id/pay', (req, res) => {
  requireRole(req, 'customer');
  const job = loadJobFor(req.params.id, req.user);
  if (job.status !== 'completed') throw conflict('You can pay once the job is finished');
  if (!['unpaid', 'failed'].includes(job.payment_status)) throw conflict('This job is already paid or being paid');

  const phone = req.body.phone ? normalizePhone(req.body.phone) : req.user.phone;
  const provider = mobileNetwork(phone);
  if (!['mtn', 'airtel'].includes(provider)) {
    throw badRequest('Use an MTN (096/076) or Airtel (097/077) number for Mobile Money');
  }

  requestPayment(job, { provider, phone });
  notifyJob(job.id);
  respond(res, job.id, req.user);
});

// ---- Ratings (both sides) ------------------------------------------------------
router.post('/:id/rate', (req, res) => {
  const job = loadJobFor(req.params.id, req.user);
  if (req.user.role === 'admin') throw forbidden();
  if (job.status !== 'completed') throw conflict('You can rate once the job is finished');

  const stars = Number(req.body.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw badRequest('Stars must be 1 to 5');
  const comment = req.body.comment ? String(req.body.comment).trim().slice(0, 500) : null;
  const toUser = req.user.id === job.customer_id ? job.worker_id : job.customer_id;

  transaction((db) => {
    const exists = db.prepare('SELECT 1 FROM ratings WHERE job_id = ? AND from_user = ?').get(job.id, req.user.id);
    if (exists) throw conflict('You already rated this job');
    db.prepare('INSERT INTO ratings (job_id, from_user, to_user, stars, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(job.id, req.user.id, toUser, stars, comment, now());

    if (req.user.role === 'customer') {
      db.prepare(
        `UPDATE workers
            SET rating_avg = (rating_avg * rating_count + ?) / (rating_count + 1),
                rating_count = rating_count + 1
          WHERE user_id = ?`
      ).run(stars, job.worker_id);
    }
  });

  notifyJob(job.id);
  respond(res, job.id, req.user);
});

export default router;
