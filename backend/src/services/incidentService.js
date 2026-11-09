// "Report a problem" and "Emergency" use cases, and staff resolving reports (Controller).
// The rules live with each incident kind in domain/incident.js; this module only coordinates.
import { config } from '../config.js';
import { loadJobFor } from '../jobs.js';
import { INCIDENT_KINDS, byPriority, checkReport, checkResolution, reportableKinds } from '../domain/incident.js';
import { invalid, missing, notAllowed } from '../domain/errors.js';
import {
  closeIncident, findIncident, incidentsForJob, insertIncident, listIncidents, openKindsBy,
} from '../repos/incidentRepo.js';
import { tell, tellAdmins, tellAgency } from './notifier.js';

function roleOnJob(user, job) {
  if (user.id === job.customer_id) return 'customer';
  if (user.id === job.worker_id) return 'worker';
  throw notAllowed('Only the customer or worker on this job can report a problem');
}

export function incidentView(row) {
  const kind = INCIDENT_KINDS[row.kind];
  return {
    id: row.id,
    jobId: row.job_id,
    kind: row.kind,
    label: kind?.label ?? row.kind,
    urgent: !!kind?.urgent,
    description: row.description,
    location: row.lat == null ? null : { lat: row.lat, lng: row.lng },
    status: row.status,
    resolution: row.resolution,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    reporter: { id: row.reporter_id, name: row.reporter_name, role: row.reporter_role, phone: row.reporter_phone },
    job: { status: row.job_status, address: row.address, service: row.service_name },
  };
}

export function reportOptions(user, jobId) {
  const job = loadJobFor(jobId, user);
  return reportableKinds(job, roleOnJob(user, job));
}

export function report(user, jobId, { kind, description, lat, lng }, now = new Date()) {
  const job = loadJobFor(jobId, user);
  const role = roleOnJob(user, job);
  const policy = checkReport({ kind, job, role, openKinds: openKindsBy(job.id, user.id), now });

  const text = description ? String(description).trim().slice(0, 1000) : '';
  if (kind !== 'emergency' && text.length < 5) throw invalid('Tell us briefly what happened');

  const view = incidentView(insertIncident({ jobId: job.id, reporterId: user.id, kind, description: text || null, lat, lng }));
  alertStaff(view, policy);
  return view;
}

// The emergency button: log it, alert staff and the agency at once, and give the caller numbers to ring.
export function raiseEmergency(user, jobId, location) {
  const incident = report(user, jobId, { kind: 'emergency', description: 'Emergency button pressed', ...location });
  return { incident, numbers: config.emergencyNumbers };
}

function alertStaff(view, policy) {
  const message = {
    event: 'incident:new',
    payload: view,
    push: policy.urgent
      ? {
          title: view.kind === 'emergency' ? 'EMERGENCY on a job' : `Urgent report: ${view.label}`,
          body: `${view.reporter.name} (${view.reporter.role}) on job #${view.jobId}, ${view.job.address}`,
          data: { url: '/admin/reports' },
        }
      : undefined,
  };
  tellAdmins(message);
  if (policy.urgent) {
    const row = findIncident(view.id);
    tellAgency(row.agency_id, { ...message, push: message.push && { ...message.push, data: { url: '/agency' } } });
  }
}

// What the customer or worker sees: their own reports on this job. Staff see all of them.
export function reportsForJob(user, jobId) {
  const job = loadJobFor(jobId, user);
  return incidentsForJob(job.id)
    .filter((r) => user.role === 'admin' || r.reporter_id === user.id)
    .map(incidentView);
}

export function listForStaff({ status, agencyId } = {}) {
  const rows = listIncidents({ status, agencyId });
  if (status === 'open') rows.sort(byPriority);
  return rows.map(incidentView);
}

export function resolve(staff, id, { outcome, resolution }) {
  const incident = findIncident(id);
  if (!incident) throw missing('Report not found');
  checkResolution(incident, outcome);
  const note = resolution ? String(resolution).trim().slice(0, 1000) : null;
  if (!note) throw invalid('Write a short note on what was done');

  const view = incidentView(closeIncident(incident.id, { outcome, resolution: note, staffId: staff.id }));
  tell(incident.reporter_id, {
    event: 'incident:update',
    payload: view,
    push: { title: 'Update on your report', body: note, data: { url: `/job/${incident.job_id}` } },
  });
  return view;
}
