import { mkdirSync } from 'node:fs';
import { checkProductionConfig, config } from './config.js';
import { startServer } from './app.js';
import { ensureFirstAdmin, startBackups, stopBackups } from './services/setup.js';

try {
  for (const warning of checkProductionConfig()) console.warn(`Warning: ${warning}`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
if (config.dataDir) mkdirSync(config.dataDir, { recursive: true });

const server = await startServer({ port: config.port, dbFile: config.dbFile });
ensureFirstAdmin();
if (config.isProduction) startBackups();
console.log(`Yewo API running on port ${config.port} (database: ${config.dbFile})`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    stopBackups();
    await server.stopAll();
    process.exit(0);
  });
}
