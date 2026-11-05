import { getDb } from './db.js';

export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Find the nearest zone whose circle contains the point (active zones only by default).
export function detectZone(point, { includeInactive = false } = {}) {
  const zones = getDb()
    .prepare(`SELECT * FROM zones ${includeInactive ? '' : 'WHERE active = 1'}`)
    .all();
  let best = null;
  for (const z of zones) {
    const d = distanceKm(point, z);
    if (d <= z.radius_km && (!best || d < best.distance_km)) best = { ...z, distance_km: d };
  }
  return best;
}

// Rough travel time across Lusaka: ~20 km/h average plus a few minutes to get going.
export const etaMinutes = (km) => Math.round(5 + (km / 20) * 60);
