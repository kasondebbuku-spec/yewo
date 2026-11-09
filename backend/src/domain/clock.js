// Lusaka calendar maths. Lusaka has no daylight saving, so a fixed offset is exact.
import { config } from '../config.js';

const DAY_MS = 86_400_000;
const offsetMs = () => config.timezoneOffsetMinutes * 60_000;

// Calendar fields of an instant, as a clock in Lusaka would show them.
export function localParts(date) {
  const d = new Date(new Date(date).getTime() + offsetMs());
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(), // 0 = Sunday
  };
}

// Monday 00:00 in Lusaka, at the start of the week containing `date`.
export function startOfLocalWeek(date) {
  const p = localParts(date);
  const sinceMonday = (p.weekday + 6) % 7;
  return new Date(Date.UTC(p.year, p.month, p.day - sinceMonday) - offsetMs());
}

export const addDays = (date, n) => new Date(new Date(date).getTime() + n * DAY_MS);
export const minutesBetween = (a, b) => (new Date(b) - new Date(a)) / 60_000;
