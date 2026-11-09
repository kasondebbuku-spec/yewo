// Persistence for service zones.
import { getDb } from '../db.js';
import { Zone } from '../domain/zone.js';

export const allZones = ({ activeOnly = false } = {}) =>
  getDb()
    .prepare(`SELECT * FROM zones ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY active DESC, name`)
    .all()
    .map((r) => new Zone(r));

export function findZone(id) {
  const row = getDb().prepare('SELECT * FROM zones WHERE id = ?').get(Number(id));
  return row ? new Zone(row) : null;
}

export function insertZone({ name, lat, lng, radiusKm, active }) {
  const r = getDb()
    .prepare('INSERT INTO zones (name, lat, lng, radius_km, active) VALUES (?, ?, ?, ?, ?)')
    .run(name, lat, lng, radiusKm, active ? 1 : 0);
  return findZone(Number(r.lastInsertRowid));
}

export function updateZone(zone) {
  getDb()
    .prepare('UPDATE zones SET name = ?, radius_km = ?, active = ? WHERE id = ?')
    .run(zone.name, zone.radiusKm, zone.active ? 1 : 0, zone.id);
  return findZone(zone.id);
}

// Jobs per zone, so staff can see where demand is before switching a zone on or off.
export const zoneActivity = () =>
  getDb()
    .prepare(
      `SELECT zone_id,
              COUNT(*) AS jobs,
              SUM(CASE WHEN status IN ('scheduled','searching','accepted','en_route','in_progress') THEN 1 ELSE 0 END) AS open
         FROM jobs GROUP BY zone_id`
    )
    .all();
