import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createHttpServer } from './http.js';
import { logger } from './utils/logger.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(serverRoot, '.env') });

const config = loadConfig();
const { app, db } = createApp(config);
const { httpServer, io } = createHttpServer(app, config, db);

const server = httpServer.listen(config.port, '0.0.0.0', () => {
  logger.info('server listening', { port: config.port });
});

function shutdown(): void {
  io.close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
