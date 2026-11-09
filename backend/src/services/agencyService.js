// The agency portal (Controller): a partner agency sees its own workers, their jobs and
// reports, and confirms that new sign-ups really work for them.
import { workerProfile } from '../jobs.js';
import { hasAllDocuments } from '../documents.js';
import { startOfLocalWeek } from '../domain/clock.js';
import { missing, notAllowed } from '../domain/errors.js';
import {
  agencyIdOfStaff, agencyOfWorker, agencyStats, confirmWorker, findAgency, recentJobs, workerIdsOf,
} from '../repos/agencyRepo.js';
import { listForStaff } from './incidentService.js';
import { tellAdmins } from './notifier.js';

export function agencyFor(user) {
  const id = agencyIdOfStaff(user.id);
  if (!id) throw notAllowed("Your login isn't linked to an agency");
  return id;
}

export function overview(agencyId, now = new Date()) {
  const agency = findAgency(agencyId);
  const { workers, week, openReports } = agencyStats(agencyId, startOfLocalWeek(now).toISOString());
  return {
    agency: { id: agency.id, name: agency.name, phone: agency.phone, area: agency.area },
    workers: {
      total: workers.total ?? 0,
      verified: workers.verified ?? 0,
      pending: workers.pending ?? 0,
      online: workers.online ?? 0,
      rating: workers.rating,
    },
    thisWeek: { jobs: week.jobs, earned: week.earned },
    openReports,
  };
}

export function agencyWorkers(agencyId) {
  return workerIdsOf(agencyId).map((id) => ({
    ...workerProfile(id, { fullNrc: true }),
    photosComplete: hasAllDocuments(id),
  }));
}

export function agencyJobs(agencyId) {
  return recentJobs(agencyId).map((j) => ({
    id: j.id,
    status: j.status,
    paymentStatus: j.payment_status,
    service: j.service_name,
    zone: j.zone_name,
    worker: j.worker_name,
    total: j.total,
    workerPayout: j.worker_payout,
    createdAt: j.created_at,
    completedAt: j.completed_at,
    scheduledFor: j.scheduled_for,
  }));
}

export const agencyReports = (agencyId) => listForStaff({ agencyId });

export function confirmMember(agencyId, workerId) {
  const w = agencyOfWorker(Number(workerId));
  if (!w || w.agency_id !== agencyId) throw missing('This person is not registered with your agency');
  confirmWorker(Number(workerId));
  const profile = workerProfile(Number(workerId), { fullNrc: true });
  tellAdmins({ event: 'worker:agency_confirmed', payload: { workerId: profile.id, name: profile.name } });
  return profile;
}
