// End-to-end tests for zones, booking ahead, reports/emergencies, payouts and the agency portal.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.OFFER_TIMEOUT_MS = '2000';
process.env.MOCK_PAYMENT_DELAY_MS = '30';
process.env.PUSH_PROVIDER = 'memory';
process.env.SCHEDULER_INTERVAL_MS = '3600000'; // tests trigger the scheduler by hand
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'yewo-ops-'));

const { startServer } = await import('../src/app.js');
const { seedDemo, DEMO_PIN } = await import('../src/seed.js');
const { sentPushes } = await import('../src/push.js');
const { runDueBookings } = await import('../src/services/bookingScheduler.js');
const { runWeeklyPayouts } = await import('../src/services/payoutService.js');
const { addDays } = await import('../src/domain/clock.js');

let server;
let base;
const HOME = { lat: -15.4135, lng: 28.3375, address: 'Plot 12, Kabulonga Rd' };
const IBEX_HILL = { lat: -15.442, lng: 28.37, address: 'Ibex Hill Rd' };

async function api(method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

const login = async (phone) => (await api('POST', '/auth/login', null, { phone, pin: DEMO_PIN })).body;

let n = 4000000;
async function newCustomer() {
  const phone = `097${n++}`;
  const sent = await api('POST', '/auth/otp/request', null, { phone, purpose: 'register' });
  const ok = await api('POST', '/auth/otp/verify', null, { phone, purpose: 'register', code: sent.body.devCode });
  const reg = await api('POST', '/auth/register', null, { name: 'Ops Customer', pin: '4321', phoneToken: ok.body.phoneToken });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  return reg.body;
}

// Tomorrow at `hour`:00 Lusaka time (UTC+2).
function tomorrowAt(hour) {
  const t = new Date(Date.now() + 2 * 3600_000 + 86_400_000);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), hour - 2));
}

// Book, accept, check in and out with Mary; optionally pay.
async function finishedJob(customer, mary, { pay = true, serviceId = 1 } = {}) {
  const booked = await api('POST', '/jobs', customer.token, { serviceId, ...HOME });
  assert.equal(booked.status, 201, JSON.stringify(booked.body));
  const id = booked.body.job.id;
  assert.equal((await api('POST', `/jobs/${id}/accept`, mary.token)).status, 200);
  await api('POST', `/jobs/${id}/check-in`, mary.token, HOME);
  await api('POST', `/jobs/${id}/check-out`, mary.token);
  if (pay) {
    await api('POST', `/jobs/${id}/pay`, customer.token, { phone: '0961234567' });
    for (let i = 0; i < 50; i++) {
      if ((await api('GET', `/jobs/${id}`, customer.token)).body.job.paymentStatus === 'paid') break;
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  return id;
}

let admin, mary, agency;

before(async () => {
  server = await startServer({ port: 0, dbFile: ':memory:' });
  base = `http://localhost:${server.address().port}`;
  seedDemo();
  admin = await login('0960000001');
  mary = await login('0962222221');
  agency = await login('0960000002');
  for (const u of [admin, mary, agency]) {
    await api('POST', '/auth/push-token', u.token, { token: `ExponentPushToken[${u.user.phone}]`, platform: 'android' });
  }
  // Only Mary takes jobs in these tests, so offers are predictable.
  for (const phone of ['0972222222', '0962222223']) {
    await api('PATCH', '/workers/me/status', (await login(phone)).token, { online: false });
  }
});

after(async () => {
  await server.stopAll();
});

describe('zones', () => {
  test('staff can open a "coming soon" zone, and bookings there then work', async () => {
    const c = await newCustomer();
    const before = await api('POST', '/jobs', c.token, { serviceId: 1, ...IBEX_HILL });
    assert.equal(before.status, 400);

    const zones = (await api('GET', '/admin/zones', admin.token)).body.zones;
    const ibex = zones.find((z) => z.name === 'Ibex Hill');
    assert.equal(ibex.active, false);
    assert.equal(typeof ibex.jobs, 'number');

    const opened = await api('PATCH', `/admin/zones/${ibex.id}`, admin.token, { active: true });
    assert.equal(opened.body.zone.active, true);
    const detect = await api('GET', `/zones/detect?lat=${IBEX_HILL.lat}&lng=${IBEX_HILL.lng}`);
    assert.equal(detect.body.available, true);

    // Booked "later" so it doesn't tie up workers.
    const after = await api('POST', '/jobs', c.token, { serviceId: 1, ...IBEX_HILL, scheduledFor: tomorrowAt(10).toISOString() });
    assert.equal(after.status, 201, JSON.stringify(after.body));
    assert.equal(after.body.job.zone.name, 'Ibex Hill');
    await api('POST', `/jobs/${after.body.job.id}/cancel`, c.token);
    await api('PATCH', `/admin/zones/${ibex.id}`, admin.token, { active: false });
  });

  test('zone input is checked and only staff can change zones', async () => {
    assert.equal((await api('PATCH', '/admin/zones/1', admin.token, { radiusKm: 99 })).status, 400);
    assert.equal((await api('PATCH', '/admin/zones/999', admin.token, { active: true })).status, 404);
    assert.equal((await api('PATCH', '/admin/zones/1', mary.token, { active: false })).status, 403);

    const added = await api('POST', '/admin/zones', admin.token, { name: 'Chelston', lat: -15.36, lng: 28.4, radiusKm: 2 });
    assert.equal(added.status, 201);
    assert.equal(added.body.zone.active, false, 'new zones start switched off');
  });
});

describe('booking ahead', () => {
  test('a booking for tomorrow waits, then dispatches shortly before the time', async () => {
    const c = await newCustomer();
    const at = tomorrowAt(9);
    const booked = await api('POST', '/jobs', c.token, { serviceId: 1, ...HOME, scheduledFor: at.toISOString(), urgent: true });
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    const job = booked.body.job;
    assert.equal(job.status, 'scheduled');
    assert.equal(job.scheduledFor, at.toISOString());
    assert.equal(job.urgent, false, 'urgent only applies to "now" bookings');
    assert.equal(job.total, 200);

    // Nobody is offered it yet.
    assert.ok(!(await api('GET', '/workers/me/offers', mary.token)).body.offers.some((o) => o.jobId === job.id));

    // Not due an hour before; due 45 minutes before.
    assert.deepEqual(runDueBookings(new Date(at.getTime() - 60 * 60_000)), []);
    sentPushes.length = 0;
    assert.deepEqual(runDueBookings(new Date(at.getTime() - 44 * 60_000)), [job.id]);

    const now = (await api('GET', `/jobs/${job.id}`, c.token)).body.job;
    assert.equal(now.status, 'searching');
    assert.ok((await api('GET', '/workers/me/offers', mary.token)).body.offers.some((o) => o.jobId === job.id));
    assert.ok(sentPushes.some((p) => p.title === 'New job nearby'));

    await api('POST', `/jobs/${job.id}/cancel`, c.token);
  });

  test('times outside the rules are refused; a customer can book now and later together', async () => {
    const c = await newCustomer();
    const early = await api('POST', '/jobs', c.token, { serviceId: 2, ...HOME, scheduledFor: tomorrowAt(5).toISOString() });
    assert.equal(early.status, 400);
    assert.match(early.body.error, /07:00/);
    const soon = await api('POST', '/jobs', c.token, { serviceId: 2, ...HOME, scheduledFor: new Date(Date.now() + 10 * 60_000).toISOString() });
    assert.equal(soon.status, 400);

    const later = await api('POST', '/jobs', c.token, { serviceId: 2, ...HOME, scheduledFor: tomorrowAt(14).toISOString() });
    assert.equal(later.status, 201);
    const now = await api('POST', '/jobs', c.token, { serviceId: 4, ...HOME }); // gardening: nobody online does it
    assert.equal(now.status, 201, 'a planned booking does not block booking now');

    const cancelled = await api('POST', `/jobs/${later.body.job.id}/cancel`, c.token);
    assert.equal(cancelled.body.job.status, 'cancelled');
    await api('POST', `/jobs/${now.body.job.id}/cancel`, c.token);
  });
});

describe('reports and emergencies', () => {
  test('emergency alerts staff and the agency at once; reports are resolved with a note', async () => {
    const c = await newCustomer();
    await api('POST', '/auth/push-token', c.token, { token: 'ExponentPushToken[ops-customer]', platform: 'android' });
    const booked = await api('POST', '/jobs', c.token, { serviceId: 1, ...HOME });
    const id = booked.body.job.id;

    // Nothing to report before a worker takes the job.
    assert.equal((await api('POST', `/jobs/${id}/reports`, c.token, { kind: 'other', description: 'Hello there' })).status, 403);

    await api('POST', `/jobs/${id}/accept`, mary.token);
    const options = (await api('GET', `/jobs/${id}/reports`, c.token)).body.options.map((o) => o.kind);
    assert.ok(options.includes('emergency') && options.includes('no_show') && !options.includes('quality'));

    sentPushes.length = 0;
    const sos = await api('POST', `/jobs/${id}/emergency`, mary.token, { lat: HOME.lat, lng: HOME.lng });
    assert.equal(sos.status, 201, JSON.stringify(sos.body));
    assert.equal(sos.body.incident.kind, 'emergency');
    assert.ok(sos.body.numbers.some((x) => x.number === '999'));
    assert.ok(sentPushes.some((p) => p.userId === admin.user.id && p.title === 'EMERGENCY on a job'));
    assert.ok(sentPushes.some((p) => p.userId === agency.user.id), 'Mary’s agency is alerted too');

    const report = await api('POST', `/jobs/${id}/reports`, c.token, { kind: 'no_show', description: 'Running very late' });
    assert.equal(report.status, 201);
    assert.equal((await api('POST', `/jobs/${id}/reports`, c.token, { kind: 'no_show', description: 'Again' })).status, 409);
    assert.equal((await api('POST', `/jobs/${id}/reports`, c.token, { kind: 'other', description: '' })).status, 400);
    assert.equal((await api('POST', `/jobs/${id}/reports`, c.token, { kind: 'customer_absent', description: 'Not me' })).status, 403);

    // Each side only sees their own reports.
    assert.deepEqual((await api('GET', `/jobs/${id}/reports`, c.token)).body.reports.map((r) => r.kind), ['no_show']);

    // Staff queue: emergency first.
    const open = (await api('GET', '/admin/incidents?status=open', admin.token)).body.incidents;
    assert.equal(open[0].kind, 'emergency');

    assert.equal((await api('POST', `/admin/incidents/${report.body.report.id}/resolve`, admin.token, { outcome: 'resolved' })).status, 400);
    sentPushes.length = 0;
    const done = await api('POST', `/admin/incidents/${report.body.report.id}/resolve`, admin.token, {
      outcome: 'resolved', resolution: 'Called Mary, she arrived 20 minutes late. K20 credit added.',
    });
    assert.equal(done.body.incident.status, 'resolved');
    assert.ok(sentPushes.some((p) => p.to === 'ExponentPushToken[ops-customer]' && p.title === 'Update on your report'));
    assert.equal((await api('POST', `/admin/incidents/${report.body.report.id}/resolve`, admin.token, { outcome: 'dismissed', resolution: 'x' })).status, 409);

    await api('POST', `/jobs/${id}/cancel`, c.token);
  });
});

describe('weekly payouts', () => {
  test('paid jobs become a weekly payout that staff mark as sent', async () => {
    const c = await newCustomer();
    const paidJob = await finishedJob(c, mary);
    const c2 = await newCustomer();
    await finishedJob(c2, mary, { pay: false }); // unpaid: not owed yet

    const waiting = (await api('GET', '/workers/me/payouts', mary.token)).body;
    assert.equal(waiting.upcoming.jobs, 1);
    assert.equal(waiting.upcoming.amount, 170);
    assert.ok(new Date(waiting.upcoming.payoutDay) > new Date());

    // This week's jobs are paid out next week.
    assert.equal(runWeeklyPayouts().payouts.length, 0);
    sentPushes.length = 0;
    const run = runWeeklyPayouts(addDays(new Date(), 7));
    assert.equal(run.payouts.length, 1);
    const payout = run.payouts[0];
    assert.equal(payout.worker.name, 'Mary Banda');
    assert.equal(payout.amount, 170);
    assert.equal(payout.worker.network, 'mtn');
    assert.ok(sentPushes.some((p) => p.userId === mary.user.id && p.title === 'Your weekly payout is ready'));
    assert.equal(runWeeklyPayouts(addDays(new Date(), 7)).payouts.length, 0, 'running twice adds nothing');

    assert.equal((await api('POST', `/admin/payouts/${payout.id}/mark-paid`, admin.token, {})).status, 400);
    const sent = await api('POST', `/admin/payouts/${payout.id}/mark-paid`, admin.token, { reference: 'MP261116.1234.A1' });
    assert.equal(sent.body.payout.status, 'paid');
    assert.equal((await api('POST', `/admin/payouts/${payout.id}/mark-paid`, admin.token, { reference: 'again' })).status, 409);

    const mine = (await api('GET', '/workers/me/payouts', mary.token)).body;
    assert.equal(mine.upcoming.jobs, 0);
    assert.equal(mine.payouts[0].status, 'paid');
    assert.ok(paidJob);
  });
});

describe('agency portal', () => {
  test('an agency sees only its own workers, jobs and reports', async () => {
    assert.equal(agency.user.agency.name, 'Kabulonga Domestic Services');

    const overview = (await api('GET', '/agency/overview', agency.token)).body;
    assert.equal(overview.workers.total, 2); // Mary and Grace
    assert.ok(overview.thisWeek.jobs >= 1);

    const workers = (await api('GET', '/agency/workers', agency.token)).body.workers.map((w) => w.name).sort();
    assert.deepEqual(workers, ['Grace Phiri', 'Mary Banda']);

    const jobs = (await api('GET', '/agency/jobs', agency.token)).body.jobs;
    assert.ok(jobs.length > 0 && jobs.every((j) => ['Mary Banda', 'Grace Phiri'].includes(j.worker)));
    assert.ok((await api('GET', '/agency/reports', agency.token)).body.reports.some((r) => r.kind === 'emergency'));
  });

  test('an agency confirms its new workers, and only its own', async () => {
    // A new sign-up who says they work for agency 1.
    const phone = '0965559001';
    const sent = await api('POST', '/auth/otp/request', null, { phone, purpose: 'register' });
    const ok = await api('POST', '/auth/otp/verify', null, { phone, purpose: 'register', code: sent.body.devCode });
    const reg = await api('POST', '/auth/register', null, {
      role: 'worker', name: 'Esther Mwale', pin: '1234', phoneToken: ok.body.phoneToken, nrc: '555555/10/1', agencyId: 1, skills: [1],
    });
    const id = reg.body.user.id;
    assert.equal(reg.body.user.worker.agencyConfirmed, false);

    const confirmed = await api('POST', `/agency/workers/${id}/confirm`, agency.token);
    assert.equal(confirmed.body.worker.agencyConfirmed, true);

    const ruth = (await api('GET', '/admin/workers', admin.token)).body.workers.find((w) => w.name === 'Ruth Zulu');
    assert.equal((await api('POST', `/agency/workers/${ruth.id}/confirm`, agency.token)).status, 404, 'Ruth is with another agency');
    assert.equal((await api('GET', '/agency/overview', mary.token)).status, 403);
  });
});
