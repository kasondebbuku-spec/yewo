// Use cases for service zones: find the zone for an address, and let staff open,
// close, resize or add neighbourhoods (Controller for the "manage zones" use case).
import { allZones, findZone, insertZone, updateZone, zoneActivity } from '../repos/zoneRepo.js';
import { checkRadius, zoneFor } from '../domain/zone.js';
import { invalid, missing } from '../domain/errors.js';

export function locate(point, { includeInactive = false } = {}) {
  return zoneFor(allZones({ activeOnly: !includeInactive }), point);
}

export const activeZoneNames = () => allZones({ activeOnly: true }).map((z) => z.name);

export function listZonesWithActivity() {
  const activity = new Map(zoneActivity().map((a) => [a.zone_id, a]));
  return allZones().map((z) => ({
    ...z.toJSON(),
    jobs: activity.get(z.id)?.jobs ?? 0,
    openJobs: activity.get(z.id)?.open ?? 0,
  }));
}

export function changeZone(id, { active, radiusKm, name }) {
  const zone = findZone(id);
  if (!zone) throw missing('Zone not found');
  if (active !== undefined) zone.active = !!active;
  if (radiusKm !== undefined) zone.radiusKm = checkRadius(radiusKm);
  if (name !== undefined) zone.name = checkName(name);
  return updateZone(zone);
}

export function addZone({ name, lat, lng, radiusKm, active = false }) {
  return insertZone({ name: checkName(name), lat, lng, radiusKm: checkRadius(radiusKm), active });
}

function checkName(name) {
  const n = String(name ?? '').trim();
  if (n.length < 2 || n.length > 60) throw invalid('Give the zone a name (2 to 60 letters)');
  return n;
}
