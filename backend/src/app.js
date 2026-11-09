import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
import { HttpError } from './errors.js';
import { attachRealtime, closeRealtime } from './realtime.js';
import { stopAllDispatch } from './dispatch.js';
import { seedCatalog } from './seed.js';
import { resolveSignedFile } from './documents.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import workerRoutes from './routes/workers.js';
import jobRoutes from './routes/jobs.js';
import adminRoutes from './routes/admin.js';
import agencyRoutes from './routes/agency.js';
import { DomainError } from './domain/errors.js';
import { startScheduler, stopScheduler } from './services/bookingScheduler.js';

const DOMAIN_STATUS = { invalid: 400, forbidden: 403, not_found: 404, conflict: 409 };

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));
  app.use((req, _res, next) => {
    req.body ??= {};
    next();
  });

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'yewo-api' }));
  app.use('/auth', authRoutes);
  app.use('/', catalogRoutes);
  app.use('/workers', workerRoutes);
  app.use('/jobs', jobRoutes);
  app.use('/admin', adminRoutes);
  app.use('/agency', agencyRoutes);

  // Private photos, only through a signed link from the admin or worker API.
  app.get('/files/:id', (req, res) => {
    const found = resolveSignedFile(req.params.id, req.query.sig);
    if (!found) return res.status(404).json({ error: 'Not found' });
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.type(found.mime).sendFile(found.file);
  });

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof DomainError) return res.status(DOMAIN_STATUS[err.kind] ?? 400).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    if (err.name === 'MulterError') {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'That photo is too big (max 5 MB).' : 'Upload failed. Please try again.';
      return res.status(400).json({ error: msg });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side' });
  });

  return app;
}

export async function startServer({ port, dbFile }) {
  initDb(dbFile);
  seedCatalog();
  const server = http.createServer(createApp());
  attachRealtime(server);
  startScheduler();
  await new Promise((resolve) => server.listen(port, resolve));

  server.stopAll = async () => {
    stopScheduler();
    stopAllDispatch();
    closeRealtime();
    await new Promise((resolve) => server.close(resolve));
  };
  return server;
}
