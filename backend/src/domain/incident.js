// Problems reported on a job. Each kind carries its own policy: who may report it,
// at which stage of the job, and whether staff must be alerted at once (Polymorphism:
// the service asks the kind instead of switching on its name).
import { config } from '../config.js';
import { ACTIVE_STATUSES } from './jobLifecycle.js';
import { clash, invalid, notAllowed } from './errors.js';

const BOTH = ['customer', 'worker'];
const ASSIGNED = [...ACTIVE_STATUSES, 'completed', 'cancelled'];

export const INCIDENT_KINDS = {
  emergency: { label: 'Emergency', reporters: BOTH, when: ACTIVE_STATUSES, urgent: true },
  safety: { label: 'Unsafe or abusive behaviour', reporters: BOTH, when: ASSIGNED, urgent: true },
  no_show: { label: "Worker didn't arrive", reporters: ['customer'], when: ASSIGNED, urgent: false },
  customer_absent: { label: "Customer wasn't there", reporters: ['worker'], when: ASSIGNED, urgent: false },
  quality: { label: 'Job not done properly', reporters: ['customer'], when: ['completed'], urgent: false },
  damage: { label: 'Something was damaged or went missing', reporters: BOTH, when: ['in_progress', 'completed'], urgent: false },
  payment: { label: 'Payment problem', reporters: BOTH, when: ['completed'], urgent: false },
  other: { label: 'Something else', reporters: BOTH, when: ASSIGNED, urgent: false },
};

export const OUTCOMES = ['resolved', 'dismissed'];

function endedAt(job) {
  return job.completed_at ?? job.cancelled_at ?? null;
}

// The kinds this person can report on this job right now (for the app's form).
export function reportableKinds(job, role, now = new Date()) {
  return Object.entries(INCIDENT_KINDS)
    .filter(([kind]) => whyNot(kind, job, role, now) === null)
    .map(([kind, k]) => ({ kind, label: k.label, urgent: k.urgent }));
}

// Throws if this report isn't allowed. `openKinds` = kinds this person already has open on the job.
export function checkReport({ kind, job, role, openKinds = [], now = new Date() }) {
  if (!INCIDENT_KINDS[kind]) throw invalid('Choose what went wrong');
  const reason = whyNot(kind, job, role, now);
  if (reason) throw notAllowed(reason);
  if (kind !== 'emergency' && openKinds.includes(kind)) {
    throw clash('You already reported this. Our team is looking into it.');
  }
  return INCIDENT_KINDS[kind];
}

function whyNot(kind, job, role, now) {
  const k = INCIDENT_KINDS[kind];
  if (!job.worker_id) return 'You can report a problem once a worker has taken the job.';
  if (!k.reporters.includes(role)) return 'This kind of report is not available to you.';
  if (!k.when.includes(job.status)) {
    return kind === 'emergency' ? 'The emergency button works while a job is under way.' : 'You can’t report this at this stage of the job.';
  }
  const ended = endedAt(job);
  if (ended && now - new Date(ended) > config.reportWindowDays * 86_400_000) {
    return `Reports must be made within ${config.reportWindowDays} days of the job.`;
  }
  return null;
}

export function checkResolution(incident, outcome) {
  if (!OUTCOMES.includes(outcome)) throw invalid('Outcome must be resolved or dismissed');
  if (incident.status !== 'open') throw clash('This report is already closed');
}

// Urgent first, then oldest first.
export const byPriority = (a, b) =>
  Number(INCIDENT_KINDS[b.kind]?.urgent ?? 0) - Number(INCIDENT_KINDS[a.kind]?.urgent ?? 0) ||
  a.created_at.localeCompare(b.created_at);
