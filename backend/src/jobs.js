// Shared job helpers: loading, shaping for each viewer, and pushing updates.
import { getDb } from './db.js';
import { distanceKm, etaMinutes } from './geo.js';
import { emitToUser } from './realtime.js';
import { pushToUser } from './push.js';
import { maskNrc } from './validation.js';
import { forbidden, notFound } from './errors.js';

export const ACTIVE_STATUSES = ['accepted', 'en_route', 'in_progress'];

export function loadJob(id) {
  const job = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(Number(id));
  if (!job) throw notFound('Job not found');
  return job;
}

// Load a job and make sure the user is allowed to see it.
export function loadJobFor(id, user) {
  const job = loadJob(id);
  const allowed =
    user.role === 'admin' || job.customer_id === user.id || job.worker_id === user.id;
  if (!allowed) throw forbidden('This is not your job');
  return job;
}

export function workerProfile(workerId, { fullNrc = false } = {}) {
  const w = getDb()
    .prepare(
      `SELECT u.id, u.name, u.phone, w.nrc, w.verification_status, w.verification_note, w.rating_avg, w.rating_count,
              w.jobs_completed, w.lat, w.lng, w.location_at, w.is_online, w.skills,
              a.id AS agency_id, a.name AS agency_name, a.phone AS agency_phone
         FROM users u
         JOIN workers w ON w.user_id = u.id
         JOIN agencies a ON a.id = w.agency_id
        WHERE u.id = ?`
    )
    .get(workerId);
  if (!w) return null;
  return {
    id: w.id,
    name: w.name,
    phone: w.phone,
    nrc: fullNrc ? w.nrc : maskNrc(w.nrc),
    verificationStatus: w.verification_status,
    verified: w.verification_status === 'verified',
    verificationNote: w.verification_note,
    agency: { id: w.agency_id, name: w.agency_name, phone: w.agency_phone },
    rating: Math.round(w.rating_avg * 10) / 10,
    ratingCount: w.rating_count,
    jobsCompleted: w.jobs_completed,
    online: !!w.is_online,
    skills: JSON.parse(w.skills),
    location: w.lat == null ? null : { lat: w.lat, lng: w.lng, at: w.location_at },
  };
}

// The full job as seen by its customer, its worker or an admin.
export function jobView(job, viewer) {
  const db = getDb();
  const service = db.prepare('SELECT id, name FROM services WHERE id = ?').get(job.service_id);
  const zone = db.prepare('SELECT id, name FROM zones WHERE id = ?').get(job.zone_id);
  const customer = db.prepare('SELECT id, name, phone FROM users WHERE id = ?').get(job.customer_id);
  const payment = db
    .prepare('SELECT provider, phone, amount, reference, status, updated_at FROM payments WHERE job_id = ? ORDER BY id DESC LIMIT 1')
    .get(job.id);
  const ratings = db.prepare('SELECT from_user, stars, comment FROM ratings WHERE job_id = ?').all(job.id);

  let worker = null;
  if (job.worker_id) {
    worker = workerProfile(job.worker_id, { fullNrc: viewer.role === 'admin' });
    delete worker.skills;
    const tracking = ['accepted', 'en_route'].includes(job.status) && worker.location;
    worker.distanceKm = tracking ? round1(distanceKm(worker.location, job)) : null;
    worker.etaMinutes = tracking ? etaMinutes(worker.distanceKm) : null;
  }

  return {
    id: job.id,
    status: job.status,
    paymentStatus: job.payment_status,
    service,
    zone,
    address: job.address,
    location: { lat: job.lat, lng: job.lng },
    notes: job.notes,
    urgent: !!job.urgent,
    price: job.price,
    urgencyFee: job.urgency_fee,
    total: job.total,
    commission: viewer.role === 'customer' ? undefined : job.commission,
    workerPayout: viewer.role === 'customer' ? undefined : job.worker_payout,
    customer: viewer.role === 'customer' ? undefined : customer,
    worker,
    payment: payment ?? null,
    customerRating: ratings.find((r) => r.from_user === job.customer_id) ?? null,
    workerRating: ratings.find((r) => r.from_user === job.worker_id) ?? null,
    checkInDistanceM: job.check_in_distance_m,
    createdAt: job.created_at,
    acceptedAt: job.accepted_at,
    enRouteAt: job.en_route_at,
    checkedInAt: job.checked_in_at,
    completedAt: job.completed_at,
    cancelledAt: job.cancelled_at,
    cancelReason: job.cancel_reason,
  };
}

// What a worker sees before accepting: no exact address or customer phone yet.
export function offerView(job, offer) {
  const db = getDb();
  return {
    jobId: job.id,
    service: db.prepare('SELECT id, name FROM services WHERE id = ?').get(job.service_id),
    zone: db.prepare('SELECT id, name FROM zones WHERE id = ?').get(job.zone_id),
    urgent: !!job.urgent,
    notes: job.notes,
    workerPayout: job.worker_payout,
    distanceKm: round1(offer.distance_km),
    etaMinutes: etaMinutes(offer.distance_km),
    offeredAt: offer.offered_at,
  };
}

// Phone notifications for the moments that matter. Each returns who gets it and what it says.
const JOB_PUSHES = {
  accepted: (j, w) => ({ to: 'customer', title: `${w} accepted your booking`, body: `${j.service.name}: ${w} is getting ready.` }),
  en_route: (j, w) => ({ to: 'customer', title: `${w} is on the way`, body: 'Open Yewo to follow them live.' }),
  checked_in: (j, w) => ({ to: 'customer', title: `${w} has arrived`, body: 'They checked in at your address.' }),
  completed: (j, w) => ({ to: 'customer', title: 'Job finished', body: `Pay K${j.total} with Mobile Money and rate ${w}.` }),
  no_workers: () => ({ to: 'customer', title: 'No one was free just now', body: 'Open Yewo to try again.' }),
  released: () => ({ to: 'customer', title: 'Finding you another worker', body: "Your worker can't make it. We're looking for someone else nearby." }),
  cancelled: (j) => ({ to: 'worker', title: 'Booking cancelled', body: `The customer cancelled the ${j.service.name} job.` }),
  paid: (j) => ({ to: 'worker', title: 'Payment received', body: `Customer paid K${j.total}. You earn K${j.workerPayout}.` }),
};

// Push the latest job state to both people on it. `event` (optional) also sends a phone notification.
export function notifyJob(jobId, event) {
  const job = loadJob(jobId);
  const forCustomer = jobView(job, { role: 'customer' });
  emitToUser(job.customer_id, 'job:update', forCustomer);
  if (job.worker_id) emitToUser(job.worker_id, 'job:update', jobView(job, { role: 'worker' }));

  const make = JOB_PUSHES[event];
  if (!make) return;
  const view = jobView(job, { role: 'worker' });
  const workerName = view.worker?.name.split(' ')[0] ?? 'Your worker';
  const msg = make(view, workerName);
  const userId = msg.to === 'customer' ? job.customer_id : job.worker_id;
  if (userId) pushToUser(userId, { title: msg.title, body: msg.body, data: { url: `/job/${job.id}` } });
}

export const round1 = (n) => Math.round(n * 10) / 10;
export const round2 = (n) => Math.round(n * 100) / 100;
