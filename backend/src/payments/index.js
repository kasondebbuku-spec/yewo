// Mobile Money payments.
//
// Real MTN MoMo and Airtel Money both work the same way: we send a "request to pay"
// to the customer's phone, they approve it with their MoMo PIN, and the provider
// calls us back later with the result. The mock provider below copies that flow so the
// app is built the right way from day one. To go live, add an mtn.js / airtel.js with
// the same requestToPay() shape and have their webhook call settlePayment().
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { getDb, now, transaction } from '../db.js';
import { notifyJob } from '../jobs.js';

const mockProvider = {
  requestToPay({ reference, phone }, onResult) {
    // Numbers ending in 0000 always fail, so you can test the failure screen.
    const status = phone.endsWith('0000') ? 'failed' : 'paid';
    const handle = setTimeout(() => onResult(reference, status), config.mockPaymentDelayMs);
    handle.unref?.();
  },
};

const providers = { mtn: mockProvider, airtel: mockProvider };

export function requestPayment(job, { provider, phone }) {
  const reference = `YW-${job.id}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const ts = now();
  transaction((db) => {
    db.prepare(
      `INSERT INTO payments (job_id, provider, phone, amount, reference, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(job.id, provider, phone, job.total, reference, ts, ts);
    db.prepare("UPDATE jobs SET payment_status = 'pending' WHERE id = ?").run(job.id);
  });

  providers[provider].requestToPay({ reference, phone, amount: job.total }, settlePayment);
  return reference;
}

// Called by the provider (or its webhook) once the customer approves or rejects.
export function settlePayment(reference, status) {
  const db = getDb();
  const payment = db.prepare('SELECT * FROM payments WHERE reference = ?').get(reference);
  if (!payment || payment.status !== 'pending') return;

  transaction((d) => {
    d.prepare('UPDATE payments SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), payment.id);
    d.prepare('UPDATE jobs SET payment_status = ? WHERE id = ?').run(status, payment.job_id);
  });
  notifyJob(payment.job_id, status === 'paid' ? 'paid' : undefined);
}
