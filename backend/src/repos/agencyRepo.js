// Persistence for partner agencies and their staff logins.
import { getDb, now } from '../db.js';

export const findAgency = (id) => getDb().prepare('SELECT * FROM agencies WHERE id = ?').get(Number(id)) ?? null;

export const agencyIdOfStaff = (userId) =>
  getDb().prepare('SELECT agency_id FROM agency_staff WHERE user_id = ?').get(userId)?.agency_id ?? null;

export const workerIdsOf = (agencyId) =>
  getDb().prepare('SELECT user_id FROM workers WHERE agency_id = ? ORDER BY user_id DESC').all(agencyId).map((r) => r.user_id);

export const agencyOfWorker = (workerId) =>
  getDb().prepare('SELECT agency_id, agency_confirmed_at FROM workers WHERE user_id = ?').get(workerId) ?? null;

export function confirmWorker(workerId) {
  getDb().prepare('UPDATE workers SET agency_confirmed_at = ? WHERE user_id = ?').run(now(), workerId);
}

export const staffIdsOf = (agencyId) =>
  getDb().prepare('SELECT user_id FROM agency_staff WHERE agency_id = ?').all(agencyId).map((r) => r.user_id);

export function recentJobs(agencyId, limit = 50) {
  return getDb()
    .prepare(
      `SELECT j.id, j.status, j.payment_status, j.total, j.worker_payout, j.created_at, j.completed_at, j.scheduled_for,
              s.name AS service_name, z.name AS zone_name, u.name AS worker_name
         FROM jobs j
         JOIN workers w ON w.user_id = j.worker_id
         JOIN users u ON u.id = j.worker_id
         JOIN services s ON s.id = j.service_id
         JOIN zones z ON z.id = j.zone_id
        WHERE w.agency_id = ?
        ORDER BY j.id DESC LIMIT ?`
    )
    .all(agencyId, limit);
}

export function agencyStats(agencyId, since) {
  const d = getDb();
  const workers = d
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(verification_status = 'verified') AS verified,
              SUM(verification_status = 'pending') AS pending,
              SUM(is_online) AS online,
              ROUND(AVG(CASE WHEN rating_count > 0 THEN rating_avg END), 1) AS rating
         FROM workers WHERE agency_id = ?`
    )
    .get(agencyId);
  const week = d
    .prepare(
      `SELECT COUNT(*) AS jobs, COALESCE(SUM(j.worker_payout), 0) AS earned
         FROM jobs j JOIN workers w ON w.user_id = j.worker_id
        WHERE w.agency_id = ? AND j.status = 'completed' AND j.completed_at >= ?`
    )
    .get(agencyId, since);
  const openReports = d
    .prepare(
      `SELECT COUNT(*) AS n FROM incidents i JOIN jobs j ON j.id = i.job_id JOIN workers w ON w.user_id = j.worker_id
        WHERE w.agency_id = ? AND i.status = 'open'`
    )
    .get(agencyId).n;
  return { workers, week, openReports };
}
