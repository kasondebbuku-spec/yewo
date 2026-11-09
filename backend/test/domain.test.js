// Unit tests for the domain layer: pure business rules, no server or database.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBookingTime, dispatchAt } from '../src/domain/bookingTime.js';
import { localParts, startOfLocalWeek } from '../src/domain/clock.js';
import { checkReport, reportableKinds, byPriority } from '../src/domain/incident.js';
import { priceBooking } from '../src/domain/money.js';
import { isDue, lastFullWeek, planPayouts, checkMarkPaid } from '../src/domain/payout.js';
import { Zone, zoneFor, checkRadius } from '../src/domain/zone.js';
import { DomainError } from '../src/domain/errors.js';

// Wednesday 11 Nov 2026, 10:00 in Lusaka (08:00 UTC).
const NOW = new Date('2026-11-11T08:00:00Z');
const lusaka = (iso) => new Date(`${iso}+02:00`);
const fails = (fn, kind, pattern) =>
  assert.throws(fn, (e) => e instanceof DomainError && e.kind === kind && (!pattern || pattern.test(e.message)));

describe('booking time', () => {
  test('empty means "now"', () => {
    assert.equal(parseBookingTime(undefined, NOW), null);
    assert.equal(parseBookingTime('', NOW), null);
  });

  test('accepts a time within opening hours, far enough ahead', () => {
    const at = parseBookingTime(lusaka('2026-11-12T09:00:00').toISOString(), NOW);
    assert.equal(localParts(at).hour, 9);
    assert.equal(dispatchAt(at).toISOString(), lusaka('2026-11-12T08:15:00').toISOString());
  });

  test('refuses too soon, too far, outside hours and nonsense', () => {
    fails(() => parseBookingTime(lusaka('2026-11-11T10:30:00'), NOW), 'invalid', /60 minutes/);
    fails(() => parseBookingTime(lusaka('2026-12-01T09:00:00'), NOW), 'invalid', /14 days/);
    fails(() => parseBookingTime(lusaka('2026-11-12T06:00:00'), NOW), 'invalid', /07:00/);
    fails(() => parseBookingTime(lusaka('2026-11-12T17:30:00'), NOW), 'invalid', /17:00/);
    fails(() => parseBookingTime('next tuesday', NOW), 'invalid');
  });

  test('17:00 sharp is the last start time', () => {
    assert.ok(parseBookingTime(lusaka('2026-11-12T17:00:00'), NOW));
  });
});

describe('Lusaka weeks and payouts', () => {
  test('weeks start Monday 00:00 Lusaka time', () => {
    assert.equal(startOfLocalWeek(NOW).toISOString(), lusaka('2026-11-09T00:00:00').toISOString());
    // Sunday 23:30 Lusaka still belongs to the week before.
    assert.equal(startOfLocalWeek(lusaka('2026-11-15T23:30:00')).toISOString(), lusaka('2026-11-09T00:00:00').toISOString());
  });

  test('last full week is Monday to Monday', () => {
    const { start, end } = lastFullWeek(NOW);
    assert.equal(start.toISOString(), lusaka('2026-11-02T00:00:00').toISOString());
    assert.equal(end.toISOString(), lusaka('2026-11-09T00:00:00').toISOString());
  });

  test('only paid, finished jobs not already paid out are due', () => {
    const end = lusaka('2026-11-09T00:00:00');
    const base = { status: 'completed', payment_status: 'paid', payout_id: null, completed_at: '2026-11-05T10:00:00Z', worker_payout: 170 };
    assert.equal(isDue(base, end), true);
    assert.equal(isDue({ ...base, payment_status: 'pending' }, end), false);
    assert.equal(isDue({ ...base, payout_id: 4 }, end), false);
    assert.equal(isDue({ ...base, completed_at: '2026-11-10T10:00:00Z' }, end), false, 'this week waits for next payout');
  });

  test('payouts are grouped per worker and summed', () => {
    const end = lusaka('2026-11-09T00:00:00');
    const job = (id, worker, amount) => ({
      id, worker_id: worker, worker_payout: amount, status: 'completed', payment_status: 'paid', payout_id: null, completed_at: '2026-11-04T09:00:00Z',
    });
    const plans = planPayouts([job(1, 7, 170), job(2, 7, 127.5), job(3, 8, 297.5)], end);
    assert.deepEqual(plans.map((p) => [p.workerId, p.jobs.length, p.amount]), [[7, 2, 297.5], [8, 1, 297.5]]);
  });

  test('marking paid needs a reference and only works once', () => {
    fails(() => checkMarkPaid({ status: 'pending' }, ''), 'invalid');
    fails(() => checkMarkPaid({ status: 'paid' }, 'MP123456'), 'conflict');
    assert.equal(checkMarkPaid({ status: 'pending' }, ' MP123456 '), 'MP123456');
  });
});

describe('reports and emergencies', () => {
  const job = (status, extra = {}) => ({ status, worker_id: 5, customer_id: 9, ...extra });

  test('emergency only while the job is under way', () => {
    assert.ok(checkReport({ kind: 'emergency', job: job('en_route'), role: 'customer' }));
    fails(() => checkReport({ kind: 'emergency', job: job('completed', { completed_at: NOW.toISOString() }), role: 'worker', now: NOW }), 'forbidden');
  });

  test('each kind decides who can report it and when', () => {
    fails(() => checkReport({ kind: 'no_show', job: job('accepted'), role: 'worker' }), 'forbidden');
    fails(() => checkReport({ kind: 'quality', job: job('in_progress'), role: 'customer' }), 'forbidden');
    fails(() => checkReport({ kind: 'other', job: job('searching', { worker_id: null }), role: 'customer' }), 'forbidden');
    fails(() => checkReport({ kind: 'banana', job: job('accepted'), role: 'customer' }), 'invalid');
  });

  test('no duplicates while a report is open, and a 7-day window', () => {
    fails(() => checkReport({ kind: 'other', job: job('accepted'), role: 'customer', openKinds: ['other'] }), 'conflict');
    const old = job('completed', { completed_at: '2026-11-01T08:00:00Z' });
    fails(() => checkReport({ kind: 'quality', job: old, role: 'customer', now: NOW }), 'forbidden', /7 days/);
  });

  test('the form only offers kinds that apply', () => {
    const kinds = reportableKinds(job('completed', { completed_at: NOW.toISOString() }), 'customer', NOW).map((k) => k.kind);
    assert.ok(kinds.includes('quality') && kinds.includes('payment'));
    assert.ok(!kinds.includes('emergency') && !kinds.includes('customer_absent'));
  });

  test('urgent reports come first', () => {
    const list = [
      { kind: 'quality', created_at: '1' },
      { kind: 'emergency', created_at: '3' },
      { kind: 'other', created_at: '2' },
    ].sort(byPriority);
    assert.deepEqual(list.map((x) => x.kind), ['emergency', 'quality', 'other']);
  });
});

describe('money and zones', () => {
  test('price split', () => {
    assert.deepEqual(priceBooking({ basePrice: 200, urgent: true }), {
      price: 200, urgencyFee: 30, total: 230, commission: 34.5, workerPayout: 195.5,
    });
  });

  test('a point belongs to the nearest zone that contains it', () => {
    const a = new Zone({ id: 1, name: 'A', lat: -15.417, lng: 28.341, radius_km: 2, active: 1 });
    const b = new Zone({ id: 2, name: 'B', lat: -15.43, lng: 28.341, radius_km: 2, active: 1 });
    assert.equal(zoneFor([a, b], { lat: -15.428, lng: 28.341 }).name, 'B');
    assert.equal(zoneFor([a, b], { lat: -15.3, lng: 28.2 }), null);
    fails(() => checkRadius(50), 'invalid');
  });
});
