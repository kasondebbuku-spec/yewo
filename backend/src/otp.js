// Phone verification with one-time SMS codes.
//
// 1. requestCode(phone, purpose) texts a 6-digit code (valid 10 minutes).
// 2. verifyCode(phone, purpose, code) checks it and returns a short-lived "phone token".
// 3. Sign-up and PIN reset accept that token as proof the person owns the number.
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { getDb, now } from './db.js';
import { badRequest, HttpError } from './errors.js';
import { sendSms } from './sms.js';

const MAX_ATTEMPTS = 5;
const RESEND_AFTER_MS = 60 * 1000;
const MAX_PER_HOUR = 5;

const hash = (phone, code) => createHmac('sha256', config.jwtSecret).update(`${phone}:${code}`).digest('hex');
const tooMany = (msg) => new HttpError(429, msg);

export async function requestCode(phone, purpose) {
  const db = getDb();
  const recent = db
    .prepare('SELECT purpose, created_at FROM otp_codes WHERE phone = ? AND created_at > ? ORDER BY id DESC')
    .all(phone, new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (recent.length >= MAX_PER_HOUR) throw tooMany('Too many codes requested. Try again in an hour.');
  const lastSame = recent.find((r) => r.purpose === purpose);
  if (lastSame && Date.now() - Date.parse(lastSame.created_at) < RESEND_AFTER_MS) {
    throw tooMany('Please wait a minute before asking for another code.');
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare(
    'INSERT INTO otp_codes (phone, purpose, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(phone, purpose, hash(phone, code), new Date(Date.now() + config.otpTtlMs).toISOString(), now());

  try {
    await sendSms(phone, `Your Yewo code is ${code}. It expires in 10 minutes. Never share it with anyone.`);
  } catch (err) {
    console.error('SMS failed:', err.message);
    throw new HttpError(502, "We couldn't send the SMS. Please try again.");
  }

  // Development only: hand the code back so you can test without a phone.
  const exposeCode = config.smsProvider === 'console' && (!config.isProduction || config.showSmsCodes);
  return exposeCode ? { devCode: code } : {};
}

export function verifyCode(phone, purpose, code) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM otp_codes WHERE phone = ? AND purpose = ? AND used_at IS NULL
        ORDER BY id DESC LIMIT 1`
    )
    .get(phone, purpose);

  if (!row || Date.parse(row.expires_at) < Date.now()) throw badRequest('This code has expired. Ask for a new one.');
  if (row.attempts >= MAX_ATTEMPTS) throw tooMany('Too many wrong tries. Ask for a new code.');

  const given = Buffer.from(hash(phone, String(code ?? '').trim()));
  const expected = Buffer.from(row.code_hash);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    throw badRequest('That code is not right. Check the SMS and try again.');
  }

  db.prepare('UPDATE otp_codes SET used_at = ? WHERE id = ?').run(now(), row.id);
  return jwt.sign({ phone, purpose, typ: 'phone' }, config.jwtSecret, { expiresIn: '15m' });
}

// Returns the verified phone number, or throws.
export function phoneFromToken(token, purpose) {
  try {
    const p = jwt.verify(String(token ?? ''), config.jwtSecret);
    if (p.typ === 'phone' && p.purpose === purpose) return p.phone;
  } catch {
    // fall through
  }
  throw badRequest('Please verify your phone number with the SMS code first.');
}
