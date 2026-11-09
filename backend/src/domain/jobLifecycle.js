// The booking lifecycle in one place (Information Expert for job states).
//
//   scheduled --(time comes)--> searching -> accepted -> en_route -> in_progress -> completed
//                                   |            |          |
//                                   |            +----------+--> back to searching if the worker drops it
//                                   +--> no_workers (customer can retry)
//   The customer can cancel any time before the worker checks in.

export const ACTIVE_STATUSES = ['accepted', 'en_route', 'in_progress']; // a worker is on it
export const OPEN_STATUSES = ['searching', ...ACTIVE_STATUSES]; // happening now
export const TRACKING_STATUSES = ['accepted', 'en_route']; // customer can follow the worker

// Every allowed move: which states it starts from and where it ends.
export const TRANSITIONS = {
  startSearch: { from: ['scheduled'], to: 'searching' },
  accept: { from: ['searching'], to: 'accepted' },
  release: { from: ['accepted', 'en_route'], to: 'searching' },
  enRoute: { from: ['accepted'], to: 'en_route' },
  checkIn: { from: ['accepted', 'en_route'], to: 'in_progress' },
  checkOut: { from: ['in_progress'], to: 'completed' },
  cancel: { from: ['scheduled', 'searching', 'accepted', 'en_route', 'no_workers'], to: 'cancelled' },
  retry: { from: ['no_workers'], to: 'searching' },
  giveUp: { from: ['searching'], to: 'no_workers' },
};

export function transition(name) {
  const t = TRANSITIONS[name];
  if (!t) throw new Error(`Unknown job transition ${name}`);
  return t;
}

export const isActive = (status) => ACTIVE_STATUSES.includes(status);
