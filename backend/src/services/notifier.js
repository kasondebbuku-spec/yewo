// Indirection between the use cases and how people are reached (live socket + phone push).
// Services say *who* to tell and *what*; this module knows *how*. Swapping push providers
// or adding SMS alerts later only changes this file.
import { emitToUser } from '../realtime.js';
import { pushToUser } from '../push.js';
import { adminIds } from '../repos/incidentRepo.js';
import { staffIdsOf } from '../repos/agencyRepo.js';

export function tell(userId, { event, payload, push }) {
  if (event) emitToUser(userId, event, payload);
  if (push) pushToUser(userId, push);
}

export function tellAdmins(message) {
  for (const id of adminIds()) tell(id, message);
}

export function tellAgency(agencyId, message) {
  if (!agencyId) return;
  for (const id of staffIdsOf(agencyId)) tell(id, message);
}
