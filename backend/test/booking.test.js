// End-to-end tests: a real server on a random port with an in-memory database.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';

process.env.OFFER_TIMEOUT_MS = '300';
process.env.MOCK_PAYMENT_DELAY_MS = '50';
process.env.MAX_WAVES = '2';
process.env.PUSH_PROVIDER = 'memory';
const { mkdtempSync } = await import('node:fs');
const { join } = await import('node:path');
const { tmpdir } = await import('node:os');
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'yewo-test-'));

const { startServer } = await import('../src/app.js');
const { seedDemo, DEMO_PIN } = await import('../src/seed.js');
const { sentPushes } = await import('../src/push.js');

// A tiny valid PNG, used as a stand-in for NRC photos.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

let server;
let base;
const sockets = [];

const KABULONGA_HOME = { lat: -15.4135, lng: 28.3375, address: 'Plot 12, Kabulonga Rd' };

async function api(method, path, token, body) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

const login = async (phone) => (await api('POST', '/auth/login', null, { phone, pin: DEMO_PIN })).body;

let phoneCounter = 3000000;
const nextPhone = () => `097${phoneCounter++}`;

// SMS step: ask for a code (the console provider returns it in development) and verify it.
async function verifyPhone(phone, purpose = 'register') {
  const sent = await api('POST', '/auth/otp/request', null, { phone, purpose });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const verified = await api('POST', '/auth/otp/verify', null, { phone, purpose, code: sent.body.devCode });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return verified.body.phoneToken;
}

async function register(fields) {
  const phone = fields.phone ?? nextPhone();
  const phoneToken = await verifyPhone(phone);
  const r = await api('POST', '/auth/register', null, { pin: '4321', ...fields, phoneToken });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}

const newCustomer = () => register({ name: 'Test Customer' });

async function uploadPhoto(token, kind, bytes = PNG) {
  const form = new FormData();
  form.append('photo', new Blob([bytes]), 'photo.png');
  const res = await fetch(`${base}/workers/me/documents/${kind}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: res.status, body: await res.json() };
}

async function socketFor(token) {
  const s = connect(base, { auth: { token }, transports: ['websocket'] });
  sockets.push(s);
  await new Promise((resolve, reject) => {
    s.on('connect', resolve);
    s.on('connect_error', reject);
  });
  return s;
}

function waitFor(socket, event, match = () => true, ms = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), ms);
    const handler = (data) => {
      if (!match(data)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    };
    socket.on(event, handler);
  });
}

before(async () => {
  server = await startServer({ port: 0, dbFile: ':memory:' });
  base = `http://localhost:${server.address().port}`;
  seedDemo();
});

after(async () => {
  for (const s of sockets) s.close();
  await server.stopAll();
});

describe('accounts and verification', () => {
  test('phone numbers are normalised, so +260 works for login', async () => {
    const r = await api('POST', '/auth/login', null, { phone: '+260 97 111 1111', pin: DEMO_PIN });
    assert.equal(r.status, 200);
    assert.equal(r.body.user.name, 'Chanda Mwila');
  });

  test('wrong PIN is rejected', async () => {
    const r = await api('POST', '/auth/login', null, { phone: '0971111111', pin: '0000' });
    assert.equal(r.status, 401);
  });

  test('worker sign-up checks the NRC format', async () => {
    const phone = '0965550001';
    const phoneToken = await verifyPhone(phone);
    const r = await api('POST', '/auth/register', null, {
      role: 'worker', name: 'Bad NRC', phoneToken, pin: '1234', nrc: '12345', agencyId: 1, skills: [1],
    });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /NRC/);
  });

  test('workers need NRC photos and admin approval before going online', async () => {
    const reg = await register({
      role: 'worker', name: 'New Worker', phone: '0965550002', pin: '1234',
      nrc: '999999/10/1', agencyId: 2, skills: [1, 2],
    });
    assert.equal(reg.user.worker.verificationStatus, 'pending');
    const workerToken = reg.token;
    const workerId = reg.user.id;

    const tooEarly = await api('PATCH', '/workers/me/status', workerToken, { online: true, ...KABULONGA_HOME });
    assert.equal(tooEarly.status, 403);

    // Admin can't approve without photos.
    const admin = await login('0960000001');
    const noPhotos = await api('POST', `/admin/workers/${workerId}/verify`, admin.token, { decision: 'verified' });
    assert.equal(noPhotos.status, 400);
    assert.match(noPhotos.body.error, /NRC/);

    // Only real images, and only the three known photo types, are accepted.
    const notImage = await uploadPhoto(workerToken, 'nrc_front', Buffer.from('this is not a photo'));
    assert.equal(notImage.status, 400);
    assert.equal((await uploadPhoto(workerToken, 'passport')).status, 400);

    for (const kind of ['nrc_front', 'nrc_back', 'selfie']) {
      const up = await uploadPhoto(workerToken, kind);
      assert.equal(up.status, 200, JSON.stringify(up.body));
    }

    // Admin sees the three photos through signed links.
    const pending = await api('GET', '/admin/workers?status=pending', admin.token);
    const listed = pending.body.workers.find((w) => w.id === workerId);
    assert.deepEqual(listed.documents.map((d) => d.uploaded), [true, true, true]);
    const photo = await fetch(listed.documents[0].url);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/png');
    const tampered = await fetch(listed.documents[0].url.replace(/sig=.*/, 'sig=nope'));
    assert.equal(tampered.status, 404);

    // Approve: the worker gets a push notification and can go online.
    await api('POST', '/auth/push-token', workerToken, { token: 'ExponentPushToken[new-worker]', platform: 'android' });
    const verify = await api('POST', `/admin/workers/${workerId}/verify`, admin.token, { decision: 'verified' });
    assert.equal(verify.body.worker.verified, true);
    assert.ok(sentPushes.some((p) => p.userId === workerId && /verified/.test(p.title)));

    const online = await api('PATCH', '/workers/me/status', workerToken, { online: true, ...KABULONGA_HOME });
    assert.equal(online.status, 200);
    await api('PATCH', '/workers/me/status', workerToken, { online: false });
  });

  test('sign-up needs a verified phone number', async () => {
    const phone = nextPhone();
    const noToken = await api('POST', '/auth/register', null, { name: 'X', phone, pin: '1234' });
    assert.equal(noToken.status, 400);

    const sent = await api('POST', '/auth/otp/request', null, { phone, purpose: 'register' });
    assert.match(sent.body.devCode, /^\d{6}$/);

    const again = await api('POST', '/auth/otp/request', null, { phone, purpose: 'register' });
    assert.equal(again.status, 429, 'one code per minute');

    const wrongCode = sent.body.devCode === '000000' ? '111111' : '000000';
    const wrong = await api('POST', '/auth/otp/verify', null, { phone, purpose: 'register', code: wrongCode });
    assert.equal(wrong.status, 400);

    const taken = await api('POST', '/auth/otp/request', null, { phone: '0971111111', purpose: 'register' });
    assert.equal(taken.status, 409, 'existing numbers must log in instead');

    // A phone token proves the number, but is not a login.
    const ok = await api('POST', '/auth/otp/verify', null, { phone, purpose: 'register', code: sent.body.devCode });
    assert.equal(ok.status, 200);
    assert.equal((await api('GET', '/auth/me', ok.body.phoneToken)).status, 401);
  });

  test('forgot PIN: reset with an SMS code', async () => {
    const c = await newCustomer();
    const phoneToken = await verifyPhone(c.user.phone, 'reset_pin');
    const reset = await api('POST', '/auth/reset-pin', null, { phoneToken, pin: '9999' });
    assert.equal(reset.status, 200);
    assert.equal((await api('POST', '/auth/login', null, { phone: c.user.phone, pin: '4321' })).status, 401);
    assert.equal((await api('POST', '/auth/login', null, { phone: c.user.phone, pin: '9999' })).status, 200);
  });

  test('push tokens must look like Expo tokens', async () => {
    const c = await login('0971111111');
    assert.equal((await api('POST', '/auth/push-token', c.token, { token: 'abc' })).status, 400);
  });

  test('customers cannot use worker or admin endpoints', async () => {
    const c = await login('0971111111');
    assert.equal((await api('GET', '/workers/me/offers', c.token)).status, 403);
    assert.equal((await api('GET', '/admin/stats', c.token)).status, 403);
  });
});

describe('booking', () => {
  test('addresses outside the pilot zones are refused', async () => {
    const c = await newCustomer();
    const r = await api('POST', '/jobs', c.token, {
      serviceId: 1, address: 'Chelston', lat: -15.36, lng: 28.4,
    });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Kabulonga/);
  });

  test('full booking loop: offer, accept, track, check in, check out, pay, rate', async () => {
    const customer = await newCustomer();
    const mary = await login('0962222221');
    const grace = await login('0972222222');
    const customerSocket = await socketFor(customer.token);
    const marySocket = await socketFor(mary.token);
    await api('POST', '/auth/push-token', mary.token, { token: 'ExponentPushToken[mary]', platform: 'android' });
    await api('POST', '/auth/push-token', customer.token, { token: 'ExponentPushToken[customer]', platform: 'android' });
    sentPushes.length = 0;
    const graceSocket = await socketFor(grace.token);

    const maryOffer = waitFor(marySocket, 'job:offer');
    const graceOffer = waitFor(graceSocket, 'job:offer');

    const booked = await api('POST', '/jobs', customer.token, {
      serviceId: 1, ...KABULONGA_HOME, notes: 'Gate code 4455', urgent: true,
    });
    assert.equal(booked.status, 201, JSON.stringify(booked.body));
    const job = booked.body.job;
    assert.equal(job.status, 'searching');
    assert.equal(job.zone.name, 'Kabulonga');
    assert.equal(job.total, 230); // K200 + K30 urgency fee
    assert.equal(job.commission, undefined, 'customers do not see the commission split');

    // Both nearby cleaners get the offer, without the exact address.
    const offer = await maryOffer;
    await graceOffer;
    assert.equal(offer.jobId, job.id);
    assert.equal(offer.workerPayout, 195.5); // 230 minus 15%
    assert.equal(offer.address, undefined);

    // Mary accepts first; Grace's offer is withdrawn and she can't take it.
    const graceClosed = waitFor(graceSocket, 'job:offer_closed', (d) => d.jobId === job.id);
    const customerSeesAccept = waitFor(customerSocket, 'job:update', (j) => j.status === 'accepted');
    const accepted = await api('POST', `/jobs/${job.id}/accept`, mary.token);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.job.address, KABULONGA_HOME.address);
    await graceClosed;
    const seen = await customerSeesAccept;
    assert.equal(seen.worker.name, 'Mary Banda');
    assert.equal(seen.worker.verified, true);
    assert.equal(seen.worker.nrc, '******/10/1', 'customer sees a masked NRC');
    assert.equal(seen.worker.agency.name, 'Kabulonga Domestic Services');
    assert.ok(seen.worker.etaMinutes > 0);

    assert.equal((await api('POST', `/jobs/${job.id}/accept`, grace.token)).status, 409);

    // Phone notifications: Mary heard about the job, the customer heard Mary accepted.
    assert.ok(sentPushes.some((p) => p.to === 'ExponentPushToken[mary]' && p.title === 'Urgent job nearby'));
    const acceptedPush = sentPushes.find((p) => p.to === 'ExponentPushToken[customer]');
    assert.equal(acceptedPush.title, 'Mary accepted your booking');
    assert.equal(acceptedPush.data.url, `/job/${job.id}`);

    // Live location reaches the customer.
    await api('POST', `/jobs/${job.id}/en-route`, mary.token);
    const loc = waitFor(customerSocket, 'worker:location');
    await api('POST', '/workers/me/location', mary.token, { lat: -15.414, lng: 28.338 });
    assert.equal((await loc).jobId, job.id);

    // Check-in only works at the address.
    const far = await api('POST', `/jobs/${job.id}/check-in`, mary.token, { lat: -15.43, lng: 28.36 });
    assert.equal(far.status, 400);
    const near = await api('POST', `/jobs/${job.id}/check-in`, mary.token, { lat: -15.4136, lng: 28.3376 });
    assert.equal(near.status, 200);
    assert.equal(near.body.job.status, 'in_progress');

    const done = await api('POST', `/jobs/${job.id}/check-out`, mary.token);
    assert.equal(done.body.job.status, 'completed');

    // Pay with MoMo (mock): pending, then paid via a pushed update.
    const paid = waitFor(customerSocket, 'job:update', (j) => j.paymentStatus === 'paid');
    const pay = await api('POST', `/jobs/${job.id}/pay`, customer.token, { phone: '0961234567' });
    assert.equal(pay.body.job.paymentStatus, 'pending');
    assert.equal(pay.body.job.payment.provider, 'mtn');
    await paid;
    assert.ok(sentPushes.some((p) => p.to === 'ExponentPushToken[mary]' && p.title === 'Payment received'));

    // Rate Mary: her average moves from 4.8 (23 ratings) toward 5.
    const rated = await api('POST', `/jobs/${job.id}/rate`, customer.token, { stars: 5, comment: 'Excellent' });
    assert.equal(rated.status, 200);
    assert.equal(rated.body.job.worker.rating, 4.8);
    assert.equal(rated.body.job.worker.ratingCount, 24);
    assert.equal((await api('POST', `/jobs/${job.id}/rate`, customer.token, { stars: 4 })).status, 409);

    const earnings = await api('GET', '/workers/me/earnings', mary.token);
    assert.equal(earnings.body.today.amount, 195.5);
  });

  test('if everyone declines, the job ends as "no workers" and can be retried', async () => {
    const customer = await newCustomer();
    const customerSocket = await socketFor(customer.token);
    const mary = await login('0962222221');
    const joseph = await login('0962222223');

    // General labour: Mary and Joseph have that skill.
    const booked = await api('POST', '/jobs', customer.token, { serviceId: 3, ...KABULONGA_HOME });
    const jobId = booked.body.job.id;

    const noWorkers = waitFor(customerSocket, 'job:update', (j) => j.status === 'no_workers');
    await api('POST', `/jobs/${jobId}/decline`, mary.token);
    await api('POST', `/jobs/${jobId}/decline`, joseph.token);
    await noWorkers;

    const retry = await api('POST', `/jobs/${jobId}/retry`, customer.token);
    assert.equal(retry.body.job.status, 'searching');
    const offers = await api('GET', '/workers/me/offers', joseph.token);
    assert.ok(offers.body.offers.some((o) => o.jobId === jobId));

    const cancelled = await api('POST', `/jobs/${jobId}/cancel`, customer.token, { reason: 'Changed plans' });
    assert.equal(cancelled.body.job.status, 'cancelled');
    assert.equal((await api('GET', '/workers/me/offers', joseph.token)).body.offers.length, 0);
  });

  test('offers expire and the job gives up after the last wave', async () => {
    const customer = await newCustomer();
    const customerSocket = await socketFor(customer.token);
    const noWorkers = waitFor(customerSocket, 'job:update', (j) => j.status === 'no_workers', 3000);
    await api('POST', '/jobs', customer.token, { serviceId: 5, ...KABULONGA_HOME }); // only Grace deep-cleans
    await noWorkers;
  });

  test('a failed MoMo payment can be retried', async () => {
    const customer = await newCustomer();
    const customerSocket = await socketFor(customer.token);
    const grace = await login('0972222222');
    const booked = await api('POST', '/jobs', customer.token, { serviceId: 2, ...KABULONGA_HOME });
    const id = booked.body.job.id;

    await api('POST', `/jobs/${id}/accept`, grace.token);
    await api('POST', `/jobs/${id}/check-in`, grace.token, KABULONGA_HOME);
    await api('POST', `/jobs/${id}/check-out`, grace.token);

    const failed = waitFor(customerSocket, 'job:update', (j) => j.paymentStatus === 'failed');
    await api('POST', `/jobs/${id}/pay`, customer.token, { phone: '0970000000' }); // ends in 0000 = fails
    await failed;

    const paid = waitFor(customerSocket, 'job:update', (j) => j.paymentStatus === 'paid');
    await api('POST', `/jobs/${id}/pay`, customer.token, { phone: '0971234567' });
    await paid;
  });

  test('admin stats add up', async () => {
    const admin = await login('0960000001');
    const stats = (await api('GET', '/admin/stats', admin.token)).body;
    assert.equal(stats.jobsCompleted, 2);
    assert.equal(stats.gmv, 230 + 150);
    assert.equal(stats.commission, 34.5 + 22.5);
  });
});
