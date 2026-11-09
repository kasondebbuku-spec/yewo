import { Router } from 'express';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { requireCoords } from '../validation.js';
import { allZones } from '../repos/zoneRepo.js';
import { locate } from '../services/zoneService.js';

const router = Router();

router.get('/services', (_req, res) => {
  res.json({ services: getDb().prepare('SELECT * FROM services ORDER BY id').all() });
});

router.get('/agencies', (_req, res) => {
  res.json({ agencies: getDb().prepare('SELECT id, name, area FROM agencies ORDER BY name').all() });
});

router.get('/zones', (_req, res) => {
  res.json({ zones: allZones() });
});

// "Is Yewo available where I am?"
router.get('/zones/detect', (req, res) => {
  const zone = locate(requireCoords(req.query.lat, req.query.lng), { includeInactive: true });
  res.json({
    zone: zone ? { id: zone.id, name: zone.name, active: zone.active } : null,
    available: !!zone?.active,
  });
});

// Booking hours and emergency numbers, so the app doesn't hard-code them.
router.get('/settings', (_req, res) => {
  const s = config.scheduling;
  res.json({
    scheduling: {
      minLeadMinutes: s.minLeadMinutes,
      maxDaysAhead: s.maxDaysAhead,
      openHour: s.openHour,
      lastStartHour: s.lastStartHour,
      timezoneOffsetMinutes: config.timezoneOffsetMinutes,
    },
    emergencyNumbers: config.emergencyNumbers,
  });
});

export default router;
