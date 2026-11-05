import { config } from './config.js';
import { startServer } from './app.js';

const server = await startServer({ port: config.port, dbFile: config.dbFile });
console.log(`Yewo API running on http://localhost:${config.port}`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.stopAll();
    process.exit(0);
  });
}
