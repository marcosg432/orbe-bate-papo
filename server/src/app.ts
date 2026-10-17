import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config.js';
import { openDatabase, type AppDatabase } from './database/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createHealthRouter } from './routes/health.js';
import { createRoomsRouter } from './routes/rooms.js';
import { isOriginAllowed } from './utils/origin.js';

const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
const clientIndex = path.join(clientDist, 'index.html');

export type Application = {
  app: Express;
  db: AppDatabase;
  config: AppConfig;
};

export function createApp(config: AppConfig): Application {
  const db = openDatabase(config.databasePath);
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use((req, res, next) => {
    cors({
      origin(origin, callback) {
        if (isOriginAllowed(origin, req.get('host'), config.clientOrigin)) callback(null, true);
        else callback(null, false);
      },
      credentials: true,
    })(req, res, next);
  });
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api/health', createHealthRouter());
  app.use('/api/rooms', createRoomsRouter(db, config));
  if (fs.existsSync(clientIndex)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
        next();
        return;
      }
      res.set('Cache-Control', 'no-cache');
      res.sendFile(clientIndex, (error) => {
        if (error) next(error);
      });
    });
  } else {
    app.get('/', (_req, res) => {
      res.json({ name: 'orbe', ok: true });
    });
  }
  app.use((_req, res) => {
    res.status(404).json({ error: 'Não encontrado.', code: 'not_found' });
  });
  app.use(errorHandler);
  return { app, db, config };
}
