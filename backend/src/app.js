import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
import { HttpError } from './errors.js';
import { attachRealtime, closeRealtime } from './realtime.js';
import { stopAllDispatch } from './dispatch.js';
import { seedCatalog } from './seed.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import workerRoutes from './routes/workers.js';
import jobRoutes from './routes/jobs.js';
import adminRoutes from './routes/admin.js';

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

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
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
  await new Promise((resolve) => server.listen(port, resolve));

  server.stopAll = async () => {
    stopAllDispatch();
    closeRealtime();
    await new Promise((resolve) => server.close(resolve));
  };
  return server;
}
