// Production housekeeping: config safety checks, first admin, database backups.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkProductionConfig, config } from '../src/config.js';
import { initDb, getDb } from '../src/db.js';
import { seedCatalog } from '../src/seed.js';
import { backupNow, ensureFirstAdmin } from '../src/services/setup.js';

initDb(':memory:');
seedCatalog();

describe('production settings', () => {
  const prod = { ...config, isProduction: true, jwtSecret: 'x'.repeat(40), dataDir: '/data', smsProvider: 'africastalking', firstAdmin: { phone: '0960000009' } };

  test('refuses the dev secret or a missing volume', () => {
    assert.throws(() => checkProductionConfig({ ...prod, jwtSecret: 'dev-secret-change-me' }), /JWT_SECRET/);
    assert.throws(() => checkProductionConfig({ ...prod, dataDir: '' }), /volume/);
    assert.deepEqual(checkProductionConfig(prod), []);
  });

  test('warns when nobody can receive sign-up codes or log in as staff', () => {
    const w = checkProductionConfig({ ...prod, smsProvider: 'console', firstAdmin: { phone: '' } });
    assert.equal(w.length, 2);
  });
});

describe('first admin', () => {
  test('is created once, with a 6-digit PIN, and never overwritten', () => {
    assert.throws(() => ensureFirstAdmin({ phone: '0960000009', name: 'A', pin: '1234' }), /6 digits/);
    const id = ensureFirstAdmin({ phone: '+260 96 000 0009', name: 'Owner', pin: '582014' });
    assert.ok(id);
    assert.equal(getDb().prepare('SELECT role, phone FROM users WHERE id = ?').get(id).phone, '0960000009');
    assert.equal(ensureFirstAdmin({ phone: '0960000009', name: 'Owner', pin: '999999' }), null);
    assert.equal(ensureFirstAdmin({ phone: '', pin: '' }), null);
  });
});

describe('backups', () => {
  test('writes a copy and keeps only the newest ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'yewo-backup-'));
    for (const day of ['01', '02', '03']) writeFileSync(join(dir, `yewo-2020-01-${day}.db`), '');
    const file = backupNow(dir, 2);
    const left = readdirSync(dir).sort();
    assert.equal(left.length, 2);
    assert.ok(left.includes(file.split(/[\\/]/).pop()));
    assert.ok(left.includes('yewo-2020-01-03.db'));
  });
});
