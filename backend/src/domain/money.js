// Information Expert for the money on a booking: price, fees and the Yewo / worker split.
import { config } from '../config.js';

export const round1 = (n) => Math.round(n * 10) / 10;
export const round2 = (n) => Math.round(n * 100) / 100;

export function priceBooking({ basePrice, urgent }, rules = config) {
  const urgencyFee = urgent ? rules.urgencyFee : 0;
  const total = basePrice + urgencyFee;
  const commission = round2(total * rules.commissionRate);
  return { price: basePrice, urgencyFee, total, commission, workerPayout: round2(total - commission) };
}

export const sumPayouts = (jobs) => round2(jobs.reduce((s, j) => s + j.worker_payout, 0));
