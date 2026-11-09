// Dates and times shown in Lusaka time, whatever timezone the phone is set to.
import type { Settings } from './settings';

const LUSAKA_OFFSET_MIN = 120;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

// A Date shifted so its UTC fields read as Lusaka wall-clock time.
const local = (d: Date | string, offset = LUSAKA_OFFSET_MIN) => new Date(new Date(d).getTime() + offset * 60_000);

export function formatDay(iso: string) {
  const d = local(iso);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function formatTime(iso: string) {
  const d = local(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export const formatWhen = (iso: string) => `${formatDay(iso)}, ${formatTime(iso)}`;

export type Slot = { iso: string; label: string; available: boolean };
export type SlotDay = { key: string; label: string; slots: Slot[] };

// Hourly start times for the next few days, marking the ones too soon to book.
export function bookingSlots(rules: Settings['scheduling'], days = 7, now = new Date()): SlotDay[] {
  const offset = rules.timezoneOffsetMinutes;
  const today = local(now, offset);
  const result: SlotDay[] = [];
  for (let i = 0; i < Math.min(days, rules.maxDaysAhead); i++) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + i));
    const slots: Slot[] = [];
    for (let h = rules.openHour; h <= rules.lastStartHour; h++) {
      const at = new Date(day.getTime() + h * 3_600_000 - offset * 60_000);
      slots.push({
        iso: at.toISOString(),
        label: `${pad(h)}:00`,
        available: at.getTime() - now.getTime() >= rules.minLeadMinutes * 60_000,
      });
    }
    if (!slots.some((s) => s.available)) continue;
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${DAYS[day.getUTCDay()]} ${day.getUTCDate()}`;
    result.push({ key: day.toISOString().slice(0, 10), label, slots });
  }
  return result;
}

