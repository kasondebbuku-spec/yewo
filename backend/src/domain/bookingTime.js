// Rules for booking ahead: when a "later" booking is allowed, and when to start finding a worker.
import { config } from '../config.js';
import { localParts } from './clock.js';
import { invalid } from './errors.js';

const pad = (n) => String(n).padStart(2, '0');

// Returns null for "now", or the booked Date. Throws if the time breaks a rule.
export function parseBookingTime(input, now = new Date(), rules = config.scheduling) {
  if (input == null || input === '') return null;
  const at = new Date(input);
  if (Number.isNaN(at.getTime())) throw invalid('Choose a valid date and time');

  const aheadMs = at - now;
  if (aheadMs < rules.minLeadMinutes * 60_000) {
    throw invalid(`Book at least ${rules.minLeadMinutes} minutes ahead, or choose "Now"`);
  }
  if (aheadMs > rules.maxDaysAhead * 86_400_000) {
    throw invalid(`You can book up to ${rules.maxDaysAhead} days ahead`);
  }

  const { hour, minute } = localParts(at);
  const tooEarly = hour < rules.openHour;
  const tooLate = hour > rules.lastStartHour || (hour === rules.lastStartHour && minute > 0);
  if (tooEarly || tooLate) {
    throw invalid(`Bookings can start between ${pad(rules.openHour)}:00 and ${pad(rules.lastStartHour)}:00`);
  }
  return at;
}

// When dispatch should begin for a booking made for `scheduledFor`.
export const dispatchAt = (scheduledFor, rules = config.scheduling) =>
  new Date(new Date(scheduledFor).getTime() - rules.dispatchLeadMinutes * 60_000);
