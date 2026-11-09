// Persistence for reports and emergencies.
import { getDb, now } from '../db.js';

const SELECT = `
  SELECT i.*, u.name AS reporter_name, u.role AS reporter_role, u.phone AS reporter_phone,
         j.status AS job_status, j.address, j.customer_id, j.worker_id, s.name AS service_name,
         wk.agency_id
    FROM incidents i
    JOIN users u ON u.id = i.reporter_id
    JOIN jobs j ON j.id = i.job_id
    JOIN services s ON s.id = j.service_id
    LEFT JOIN workers wk ON wk.user_id = j.worker_id`;

export function insertIncident({ jobId, reporterId, kind, description, lat, lng }) {
  const r = getDb()
    .prepare(
      `INSERT INTO incidents (job_id, reporter_id, kind, description, lat, lng, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(jobId, reporterId, kind, description, lat ?? null, lng ?? null, now());
  return findIncident(Number(r.lastInsertRowid));
}

export const findIncident = (id) => getDb().prepare(`${SELECT} WHERE i.id = ?`).get(Number(id)) ?? null;

export const incidentsForJob = (jobId) =>
  getDb().prepare(`${SELECT} WHERE i.job_id = ? ORDER BY i.id DESC`).all(Number(jobId));

export const openKindsBy = (jobId, reporterId) =>
  getDb()
    .prepare("SELECT kind FROM incidents WHERE job_id = ? AND reporter_id = ? AND status = 'open'")
    .all(jobId, reporterId)
    .map((r) => r.kind);

export function listIncidents({ status, agencyId } = {}) {
  const where = [];
  const args = [];
  if (status) { where.push('i.status = ?'); args.push(status); }
  if (agencyId) { where.push('wk.agency_id = ?'); args.push(agencyId); }
  return getDb()
    .prepare(`${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY i.id DESC LIMIT 200`)
    .all(...args);
}

export function closeIncident(id, { outcome, resolution, staffId }) {
  getDb()
    .prepare('UPDATE incidents SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?')
    .run(outcome, resolution, staffId, now(), id);
  return findIncident(id);
}

export const adminIds = () =>
  getDb().prepare("SELECT id FROM users WHERE role = 'admin'").all().map((r) => r.id);
