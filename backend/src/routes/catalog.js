import { Router } from 'express';
import { getDb } from '../db.js';
import { detectZone } from '../geo.js';
import { requireCoords } from '../validation.js';

const router = Router();

router.get('/services', (_req, res) => {
  res.json({ services: getDb().prepare('SELECT * FROM services ORDER BY id').all() });
});

router.get('/agencies', (_req, res) => {
  res.json({ agencies: getDb().prepare('SELECT id, name, area FROM agencies ORDER BY name').all() });
});

router.get('/zones', (_req, res) => {
  const zones = getDb().prepare('SELECT * FROM zones ORDER BY active DESC, name').all();
  res.json({ zones: zones.map((z) => ({ ...z, active: !!z.active })) });
});

// "Is Yewo available where I am?"
router.get('/zones/detect', (req, res) => {
  const point = requireCoords(req.query.lat, req.query.lng);
  const zone = detectZone(point, { includeInactive: true });
  res.json({
    zone: zone ? { id: zone.id, name: zone.name, active: !!zone.active } : null,
    available: !!zone?.active,
  });
});

export default router;
