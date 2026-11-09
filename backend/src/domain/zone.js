// A service zone: a circle around a Lusaka neighbourhood. It is the expert on
// whether a point is inside it (Information Expert).
import { distanceKm } from '../geo.js';
import { invalid } from './errors.js';

export class Zone {
  constructor(row) {
    this.id = row.id;
    this.name = row.name;
    this.lat = row.lat;
    this.lng = row.lng;
    this.radiusKm = row.radius_km;
    this.active = !!row.active;
  }

  distanceTo(point) {
    return distanceKm(this, point);
  }

  contains(point) {
    return this.distanceTo(point) <= this.radiusKm;
  }

  toJSON() {
    return { id: this.id, name: this.name, lat: this.lat, lng: this.lng, radiusKm: this.radiusKm, active: this.active };
  }
}

// The closest zone whose circle contains the point.
export function zoneFor(zones, point) {
  let best = null;
  for (const z of zones) {
    if (z.contains(point) && (!best || z.distanceTo(point) < best.distanceTo(point))) best = z;
  }
  return best;
}

export const RADIUS_KM = { min: 0.5, max: 10 };

export function checkRadius(km) {
  const r = Number(km);
  if (!Number.isFinite(r) || r < RADIUS_KM.min || r > RADIUS_KM.max) {
    throw invalid(`Radius must be between ${RADIUS_KM.min} and ${RADIUS_KM.max} km`);
  }
  return r;
}
