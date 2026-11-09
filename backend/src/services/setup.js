// Production housekeeping: the first admin login, and daily database backups.
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { getDb, now } from '../db.js';
import { normalizePhone, validatePin } from '../validation.js';

// Create the first admin from ADMIN_PHONE / ADMIN_PIN if that number isn't registered yet.
// Never changes an existing account, so the PIN can be changed later with "Forgot PIN".
export function ensureFirstAdmin({ phone, name, pin } = config.firstAdmin) {
  if (!phone) return null;
  const number = normalizePhone(phone);
  const db = getDb();
  const existing = db.prepare('SELECT id, role FROM users WHERE phone = ?').get(number);
  if (existing) {
    if (existing.role !== 'admin') console.warn(`ADMIN_PHONE ${number} belongs to a ${existing.role} account; not changed.`);
    return null;
  }
  const safePin = validatePin(pin);
  if (safePin.length < 6) throw new Error('ADMIN_PIN must be 6 digits.');
  const id = Number(
    db.prepare('INSERT INTO users (role, name, phone, pin_hash, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('admin', name, number, bcrypt.hashSync(safePin, 10), now()).lastInsertRowid
  );
  console.log(`Created admin login for ${number}.`);
  return id;
}

// Copy the database to backups/yewo-<date>.db and keep the newest few.
export function backupNow(dir = config.backupDir, keep = config.backupsToKeep) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `yewo-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  getDb().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const old = readdirSync(dir).filter((f) => /^yewo-.*\.db$/.test(f)).sort().reverse().slice(keep);
  for (const f of old) rmSync(join(dir, f), { force: true });
  return file;
}

let timer = null;

export function startBackups(everyHours = config.backupEveryHours) {
  if (!everyHours) return;
  const run = () => {
    try {
      console.log(`Database backup: ${backupNow()}`);
    } catch (err) {
      console.error('Database backup failed:', err.message);
    }
  };
  run();
  timer = setInterval(run, everyHours * 3_600_000);
  timer.unref?.();
}

export const stopBackups = () => clearInterval(timer);
