// Starts dispatch for bookings made ahead of time, a little before the booked time.
// Pure Fabrication: "a clock that wakes jobs up" isn't a thing in the business, but
// giving it its own module keeps Job and Dispatch simple.
import { config } from '../config.js';
import { startDispatch } from '../dispatch.js';
import { notifyJob } from '../jobs.js';
import { applyTransition, scheduledDueBefore } from '../repos/jobRepo.js';

let handle = null;

// Move every booking whose dispatch time has come into "searching". Returns the job ids.
export function runDueBookings(now = new Date()) {
  const lead = config.scheduling.dispatchLeadMinutes * 60_000;
  const due = scheduledDueBefore(new Date(now.getTime() + lead));
  const started = [];
  for (const { id } of due) {
    try {
      applyTransition(id, 'startSearch');
    } catch {
      continue; // cancelled or started in the meantime
    }
    notifyJob(id, 'scheduled_start');
    startDispatch(id);
    started.push(id);
  }
  return started;
}

export function startScheduler(everyMs = config.scheduling.checkEveryMs) {
  stopScheduler();
  runDueBookings();
  handle = setInterval(() => {
    try {
      runDueBookings();
    } catch (err) {
      console.error('Scheduler failed:', err);
    }
  }, everyMs);
  handle.unref?.();
}

export function stopScheduler() {
  clearInterval(handle);
  handle = null;
}
