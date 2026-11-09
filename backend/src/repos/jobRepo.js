// Persistence for jobs (Pure Fabrication: keeps SQL out of the domain and services).
import { getDb, now } from '../db.js';
import { clash } from '../domain/errors.js';
import { OPEN_STATUSES, transition } from '../domain/jobLifecycle.js';

const marks = (arr) => arr.map(() => '?').join(',');

export function insertJob(j) {
  const result = getDb()
    .prepare(
      `INSERT INTO jobs (customer_id, service_id, zone_id, address, lat, lng, notes, urgent,
                         price, urgency_fee, total, commission, worker_payout, status, scheduled_for, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(j.customerId, j.serviceId, j.zoneId, j.address, j.lat, j.lng, j.notes, j.urgent ? 1 : 0,
         j.price, j.urgencyFee, j.total, j.commission, j.workerPayout, j.status, j.scheduledFor, now());
  return Number(result.lastInsertRowid);
}

// Apply a named lifecycle move. Fails if the job isn't in one of the allowed states.
export function applyTransition(jobId, name, extra = {}) {
  const { from, to } = transition(name);
  const cols = Object.keys(extra);
  const sets = ['status = ?', ...cols.map((c) => `${c} = ?`)].join(', ');
  const result = getDb()
    .prepare(`UPDATE jobs SET ${sets} WHERE id = ? AND status IN (${marks(from)})`)
    .run(to, ...Object.values(extra), jobId, ...from);
  if (!result.changes) throw clash(`This job can't be changed to "${to}" right now`);
}

export const findService = (id) => getDb().prepare('SELECT * FROM services WHERE id = ?').get(Number(id));

export const hasOpenBooking = (customerId) =>
  !!getDb()
    .prepare(`SELECT 1 FROM jobs WHERE customer_id = ? AND status IN (${marks(OPEN_STATUSES)})`)
    .get(customerId, ...OPEN_STATUSES);

export const countScheduled = (customerId) =>
  getDb().prepare("SELECT COUNT(*) AS n FROM jobs WHERE customer_id = ? AND status = 'scheduled'").get(customerId).n;

// Scheduled jobs whose dispatch time has come.
export const scheduledDueBefore = (instant) =>
  getDb()
    .prepare("SELECT id, scheduled_for FROM jobs WHERE status = 'scheduled' AND scheduled_for <= ? ORDER BY scheduled_for")
    .all(instant.toISOString());
