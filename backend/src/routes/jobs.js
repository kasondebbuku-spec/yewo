// HTTP adapter for jobs (UI layer). Each handler reads the request, calls the use case,
// and shapes the answer. Allowed state changes live in domain/jobLifecycle.js.
import { Router } from 'express';
import { config } from '../config.js';
import { getDb, now, transaction } from '../db.js';
import { requireAuth } from '../auth.js';
import { badRequest, conflict, forbidden } from '../errors.js';
import { distanceKm } from '../geo.js';
import { ACTIVE_STATUSES, jobView, loadJob, loadJobFor, notifyJob } from '../jobs.js';
import { onOfferDeclined, redispatch, startDispatch, stopDispatch } from '../dispatch.js';
import { requestPayment } from '../payments/index.js';
import { mobileNetwork, normalizePhone, requireCoords, requireText } from '../validation.js';
import { applyTransition } from '../repos/jobRepo.js';
import { createBooking } from '../services/bookingService.js';
import { raiseEmergency, report, reportOptions, reportsForJob } from '../services/incidentService.js';

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

const respond = (res, jobId, user) => res.json({ job: jobView(loadJob(jobId), user) });

const optionalCoords = (body) => (body.lat == null ? {} : requireCoords(body.lat, body.lng));

// ---- Customer books a service (now or later) ----------------------------------
router.post('/', (req, res) => {
  requireRole(req, 'customer');
  const jobId = createBooking(req.user, {
    serviceId: req.body.serviceId,
    address: requireText(req.body.address, 'Address', 200),
    point: requireCoords(req.body.lat, req.body.lng),
    notes: req.body.notes ? String(req.body.notes).trim().slice(0, 500) : null,
    urgent: !!req.body.urgent,
    scheduledFor: req.body.scheduledFor,
  });
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
    try {
      applyTransition(jobId, 'accept', { worker_id: req.user.id, accepted_at: now() });
    } catch {
      throw conflict('Another worker already took this job');
    }
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
    applyTransition(job.id, 'release', { worker_id: null, accepted_at: null, en_route_at: null });
    db.prepare("UPDATE job_offers SET status = 'declined' WHERE job_id = ? AND worker_id = ?").run(job.id, req.user.id);
  });
  notifyJob(job.id, 'released');
  redispatch(job.id);
  res.json({ ok: true });
});

// ---- Worker progress -----------------------------------------------------------
router.post('/:id/en-route', (req, res) => {
  const job = requireAssignedWorker(req);
  applyTransition(job.id, 'enRoute', { en_route_at: now() });
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
  applyTransition(job.id, 'checkIn', { checked_in_at: now(), check_in_distance_m: meters });
  notifyJob(job.id, 'checked_in');
  respond(res, job.id, req.user);
});

router.post('/:id/check-out', (req, res) => {
  const job = requireAssignedWorker(req);
  transaction((db) => {
    applyTransition(job.id, 'checkOut', { completed_at: now() });
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
  applyTransition(job.id, 'cancel', { cancelled_at: now(), cancel_reason: reason });
  stopDispatch(job.id);
  notifyJob(job.id, 'cancelled');
  respond(res, job.id, req.user);
});

// Nobody was free last time: try again.
router.post('/:id/retry', (req, res) => {
  requireRole(req, 'customer');
  const job = loadJobFor(req.params.id, req.user);
  transaction((db) => {
    applyTransition(job.id, 'retry', { dispatch_wave: 0 });
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

// ---- Reports and emergencies (both sides) --------------------------------------
router.get('/:id/reports', (req, res) => {
  const reports = reportsForJob(req.user, req.params.id);
  const options = req.user.role === 'admin' ? [] : reportOptions(req.user, req.params.id);
  res.json({ reports, options });
});

router.post('/:id/reports', (req, res) => {
  const incident = report(req.user, req.params.id, {
    kind: req.body.kind,
    description: req.body.description,
    ...optionalCoords(req.body),
  });
  res.status(201).json({ report: incident });
});

router.post('/:id/emergency', (req, res) => {
  res.status(201).json(raiseEmergency(req.user, req.params.id, optionalCoords(req.body)));
});

export default router;
