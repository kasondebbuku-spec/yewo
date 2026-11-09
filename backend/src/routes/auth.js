import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, now, transaction } from '../db.js';
import { requireAuth, signToken } from '../auth.js';
import { badRequest, conflict, HttpError, unauthorized } from '../errors.js';
import { workerProfile } from '../jobs.js';
import { phoneFromToken, requestCode, verifyCode } from '../otp.js';
import { removePushToken, savePushToken } from '../push.js';
import { normalizePhone, requireText, validateNrc, validatePin } from '../validation.js';

const router = Router();

export function parseSkills(input) {
  const ids = Array.isArray(input) ? input.map(Number) : [];
  const valid = getDb().prepare('SELECT id FROM services').all().map((s) => s.id);
  const skills = [...new Set(ids.filter((id) => valid.includes(id)))];
  if (!skills.length) throw badRequest('Pick at least one service you can do');
  return skills;
}

const meView = (user) => ({
  id: user.id,
  role: user.role,
  name: user.name,
  phone: user.phone,
  worker: user.role === 'worker' ? workerProfile(user.id, { fullNrc: true }) : undefined,
});

const PURPOSES = ['register', 'reset_pin'];

// Step 1 of sign-up / PIN reset: text a code to the number.
router.post('/otp/request', async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const purpose = req.body.purpose;
  if (!PURPOSES.includes(purpose)) throw badRequest('purpose must be register or reset_pin');

  const exists = !!getDb().prepare('SELECT 1 FROM users WHERE phone = ?').get(phone);
  if (purpose === 'register' && exists) throw conflict('An account with this number already exists. Log in instead.');
  if (purpose === 'reset_pin' && !exists) throw badRequest('There is no Yewo account with this number.');

  res.json({ sent: true, ...(await requestCode(phone, purpose)) });
});

// Step 2: check the code. Returns a phoneToken that proves the number is yours (valid 15 min).
router.post('/otp/verify', (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const purpose = req.body.purpose;
  if (!PURPOSES.includes(purpose)) throw badRequest('purpose must be register or reset_pin');
  res.json({ phoneToken: verifyCode(phone, purpose, req.body.code) });
});

router.post('/register', (req, res) => {
  const role = req.body.role ?? 'customer';
  if (!['customer', 'worker'].includes(role)) throw badRequest('role must be customer or worker');

  const name = requireText(req.body.name, 'Name', 80);
  const phone = phoneFromToken(req.body.phoneToken, 'register');
  const pin = validatePin(req.body.pin);
  const db = getDb();

  if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) {
    throw conflict('An account with this number already exists');
  }

  let worker = null;
  if (role === 'worker') {
    const nrc = validateNrc(req.body.nrc);
    if (db.prepare('SELECT 1 FROM workers WHERE nrc = ?').get(nrc)) {
      throw conflict('This NRC is already registered');
    }
    const agency = db.prepare('SELECT id FROM agencies WHERE id = ?').get(Number(req.body.agencyId));
    if (!agency) throw badRequest('Choose the agency you are registered with');
    worker = { nrc, agencyId: agency.id, skills: parseSkills(req.body.skills) };
  }

  const id = transaction((d) => {
    const result = d
      .prepare('INSERT INTO users (role, name, phone, pin_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(role, name, phone, bcrypt.hashSync(pin, 10), now());
    const userId = Number(result.lastInsertRowid);
    if (worker) {
      d.prepare('INSERT INTO workers (user_id, nrc, agency_id, skills) VALUES (?, ?, ?, ?)')
        .run(userId, worker.nrc, worker.agencyId, JSON.stringify(worker.skills));
    }
    return userId;
  });

  const user = { id, role, name, phone };
  res.status(201).json({ token: signToken(user), user: meView(user) });
});

// Basic protection against PIN guessing: 5 wrong tries locks the number for 15 minutes.
const failedLogins = new Map(); // phone -> { count, until }
const MAX_TRIES = 5;
const LOCK_MS = 15 * 60 * 1000;

router.post('/login', (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const pin = String(req.body.pin ?? '');

  const record = failedLogins.get(phone);
  if (record && record.count >= MAX_TRIES && record.until > Date.now()) {
    throw new HttpError(429, 'Too many wrong PINs. Try again in 15 minutes.');
  }

  const user = getDb().prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user || !bcrypt.compareSync(pin, user.pin_hash)) {
    const count = (record && record.until > Date.now() ? record.count : 0) + 1;
    failedLogins.set(phone, { count, until: Date.now() + LOCK_MS });
    throw unauthorized('Wrong phone number or PIN');
  }

  failedLogins.delete(phone);
  res.json({ token: signToken(user), user: meView(user) });
});

// Forgot PIN: verify the number by SMS, then choose a new PIN.
router.post('/reset-pin', (req, res) => {
  const phone = phoneFromToken(req.body.phoneToken, 'reset_pin');
  const pin = validatePin(req.body.pin);
  const db = getDb();
  db.prepare('UPDATE users SET pin_hash = ? WHERE phone = ?').run(bcrypt.hashSync(pin, 10), phone);
  failedLogins.delete(phone);
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  res.json({ token: signToken(user), user: meView(user) });
});

router.get('/me', requireAuth(), (req, res) => {
  res.json({ user: meView(req.user) });
});

// The app sends its Expo push token after login, and removes it on logout.
router.post('/push-token', requireAuth(), (req, res) => {
  savePushToken(req.user.id, req.body.token, req.body.platform);
  res.json({ ok: true });
});

router.post('/push-token/remove', requireAuth(), (req, res) => {
  removePushToken(req.user.id, req.body.token);
  res.json({ ok: true });
});

export default router;
