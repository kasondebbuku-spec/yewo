// Agency portal API (UI layer). Every request is scoped to the agency the login belongs to.
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { listDocuments } from '../documents.js';
import * as agency from '../services/agencyService.js';
import { baseUrl } from './workers.js';

const router = Router();
router.use(requireAuth('agency'));
router.use((req, _res, next) => {
  req.agencyId = agency.agencyFor(req.user);
  next();
});

router.get('/overview', (req, res) => res.json(agency.overview(req.agencyId)));

router.get('/workers', (req, res) => {
  res.json({
    workers: agency.agencyWorkers(req.agencyId).map((w) => ({
      ...w,
      documents: w.verified ? undefined : listDocuments(w.id, baseUrl(req)),
    })),
  });
});

router.get('/jobs', (req, res) => res.json({ jobs: agency.agencyJobs(req.agencyId) }));

router.get('/reports', (req, res) => res.json({ reports: agency.agencyReports(req.agencyId) }));

// "Yes, this person works for us."
router.post('/workers/:id/confirm', (req, res) => {
  res.json({ worker: agency.confirmMember(req.agencyId, req.params.id) });
});

export default router;
