import type { Express } from 'express';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { AppConfig } from '../src/config.js';
import { createApp, type Application } from '../src/app.js';
import { createHttpServer } from '../src/http.js';
import { clearPresence } from '../src/services/presence.js';
import { clearRateLimits } from '../src/services/rateLimit.js';
import { bindMessageSink } from '../src/services/realtime.js';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const rateLimits = {
    createRoom: { limit: 20, windowMs: 15 * 60 * 1000 },
    joinRoom: { limit: 40, windowMs: 15 * 60 * 1000 },
    sendMessage: { limit: 30, windowMs: 60 * 1000 },
    uploadParticipant: { limit: 20, windowMs: 10 * 60 * 1000 },
    uploadRoom: { limit: 80, windowMs: 10 * 60 * 1000 },
    ...overrides.rateLimits,
  };
  const mediaLimits = {
    image: 10 * 1024 * 1024,
    video: 100 * 1024 * 1024,
    audio: 12 * 1024 * 1024,
    document: 20 * 1024 * 1024,
    ...overrides.mediaLimits,
  };
  return {
    port: 0,
    clientOrigin: 'http://localhost:5173',
    databasePath: ':memory:',
    uploadsPath: path.join(os.tmpdir(), 'orbe-test-uploads'),
    sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
    cookieSecure: false,
    cookieSameSite: 'lax',
    trustProxy: false,
    rateLimitEnabled: false,
    ...overrides,
    mediaLimits,
    rateLimits,
  };
}

export function boot(overrides: Partial<AppConfig> = {}): Application {
  return createApp(testConfig(overrides));
}

export function cookiePair(header: string | string[] | undefined): string {
  const first = Array.isArray(header) ? header[0] : header;
  if (!first) throw new Error('Cookie ausente.');
  return first.split(';')[0] ?? '';
}

export async function createJoinedRoom(agent: ReturnType<typeof request.agent>, name = 'Ana') {
  const created = await agent.post('/api/rooms');
  if (created.status !== 201) throw new Error(`falha ao criar sala: ${created.status}`);
  const roomId = created.body.room.id as string;
  const joined = await agent.post(`/api/rooms/${roomId}/sessions`).send({ displayName: name });
  return { roomId, created, joined };
}

export async function listen(app: Express, config: AppConfig, db: Application['db']) {
  const { httpServer, io } = createHttpServer(app, config, db);
  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Porta inválida.');
  return {
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      io.close();
      if (typeof httpServer.closeAllConnections === 'function') httpServer.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

export function resetProcessState(): void {
  clearPresence();
  clearRateLimits();
  bindMessageSink(null);
}
