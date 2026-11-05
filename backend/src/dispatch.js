// Dispatch engine.
//
// When a customer books, we offer the job to the closest few verified, online, free
// workers who have the right skill ("a wave"). The first to accept gets it. If nobody
// accepts before the timer runs out, those offers expire and the next-closest workers
// get a wave. After `maxWaves` waves (or when nobody is left) the job is marked
// "no_workers" so the customer can try again.
import { config } from './config.js';
import { getDb, now } from './db.js';
import { distanceKm } from './geo.js';
import { ACTIVE_STATUSES, loadJob, notifyJob, offerView } from './jobs.js';
import { emitToUser } from './realtime.js';

const timers = new Map(); // jobId -> timeout handle

export function findCandidates(job) {
  const busy = ACTIVE_STATUSES.map(() => '?').join(',');
  const rows = getDb()
    .prepare(
      `SELECT w.user_id, w.lat, w.lng, w.skills, w.rating_avg
         FROM workers w
        WHERE w.verification_status = 'verified'
          AND w.is_online = 1
          AND w.lat IS NOT NULL
          AND w.user_id NOT IN (
                SELECT worker_id FROM jobs
                 WHERE worker_id IS NOT NULL AND status IN (${busy}))`
    )
    .all(...ACTIVE_STATUSES);

  return rows
    .filter((w) => JSON.parse(w.skills).includes(job.service_id))
    .map((w) => ({ ...w, distance_km: distanceKm(w, job) }))
    .filter((w) => w.distance_km <= config.maxDispatchKm)
    .sort((a, b) => a.distance_km - b.distance_km || b.rating_avg - a.rating_avg);
}

export function startDispatch(jobId) {
  runWave(jobId);
}

function runWave(jobId) {
  const db = getDb();
  const job = loadJob(jobId);
  if (job.status !== 'searching') return;

  const alreadyOffered = new Set(
    db.prepare('SELECT worker_id FROM job_offers WHERE job_id = ?').all(jobId).map((r) => r.worker_id)
  );
  const picks = findCandidates(job)
    .filter((c) => !alreadyOffered.has(c.user_id))
    .slice(0, config.offerBatchSize);

  const outstanding = db
    .prepare("SELECT COUNT(*) AS n FROM job_offers WHERE job_id = ? AND status = 'offered'")
    .get(jobId).n;

  if (picks.length === 0 && outstanding === 0) {
    markNoWorkers(jobId);
    return;
  }

  const wave = job.dispatch_wave + 1;
  db.prepare('UPDATE jobs SET dispatch_wave = ? WHERE id = ?').run(wave, jobId);

  const insert = db.prepare(
    'INSERT INTO job_offers (job_id, worker_id, wave, distance_km, offered_at) VALUES (?, ?, ?, ?, ?)'
  );
  for (const c of picks) {
    const offer = { distance_km: c.distance_km, offered_at: now() };
    insert.run(jobId, c.user_id, wave, c.distance_km, offer.offered_at);
    emitToUser(c.user_id, 'job:offer', offerView(job, offer));
  }

  schedule(jobId);
}

function schedule(jobId) {
  clearTimeout(timers.get(jobId));
  const handle = setTimeout(() => onTimeout(jobId), config.offerTimeoutMs);
  handle.unref?.();
  timers.set(jobId, handle);
}

function onTimeout(jobId) {
  timers.delete(jobId);
  const job = loadJob(jobId);
  if (job.status !== 'searching') return;

  expireOpenOffers(jobId);
  if (job.dispatch_wave >= config.maxWaves) markNoWorkers(jobId);
  else runWave(jobId);
}

function markNoWorkers(jobId) {
  stopDispatch(jobId);
  const res = getDb()
    .prepare("UPDATE jobs SET status = 'no_workers' WHERE id = ? AND status = 'searching'")
    .run(jobId);
  if (res.changes) notifyJob(jobId);
}

// Withdraw any offers still waiting for an answer and tell those workers.
function expireOpenOffers(jobId) {
  const db = getDb();
  const open = db
    .prepare("SELECT worker_id FROM job_offers WHERE job_id = ? AND status = 'offered'")
    .all(jobId);
  db.prepare("UPDATE job_offers SET status = 'expired' WHERE job_id = ? AND status = 'offered'").run(jobId);
  for (const o of open) emitToUser(o.worker_id, 'job:offer_closed', { jobId });
}

// Called when the job is taken or cancelled.
export function stopDispatch(jobId) {
  clearTimeout(timers.get(jobId));
  timers.delete(jobId);
  expireOpenOffers(jobId);
}

// A worker declined: if every offer in this wave has been answered, move on right away.
export function onOfferDeclined(jobId) {
  const open = getDb()
    .prepare("SELECT COUNT(*) AS n FROM job_offers WHERE job_id = ? AND status = 'offered'")
    .get(jobId).n;
  if (open === 0 && timers.has(jobId)) {
    clearTimeout(timers.get(jobId));
    onTimeout(jobId);
  }
}

// Re-run dispatch after a worker drops a job they had accepted.
export function redispatch(jobId) {
  getDb().prepare('UPDATE jobs SET dispatch_wave = 0 WHERE id = ?').run(jobId);
  runWave(jobId);
}

export function stopAllDispatch() {
  for (const handle of timers.values()) clearTimeout(handle);
  timers.clear();
}
