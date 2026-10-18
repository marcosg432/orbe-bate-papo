import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIO_MAX_BYTES,
  DOCUMENT_MAX_BYTES,
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
} from './constants.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export type SameSite = 'lax' | 'strict' | 'none';

export type RateWindow = {
  limit: number;
  windowMs: number;
};

export type MediaLimits = {
  image: number;
  video: number;
  audio: number;
  document: number;
};

export type AppConfig = {
  port: number;
  clientOrigin: string;
  databasePath: string;
  uploadsPath: string;
  sessionTtlMs: number;
  cookieSecure: boolean;
  cookieSameSite: SameSite;
  trustProxy: boolean;
  rateLimitEnabled: boolean;
  mediaLimits: MediaLimits;
  rateLimits: {
    createRoom: RateWindow;
    joinRoom: RateWindow;
    sendMessage: RateWindow;
    uploadParticipant: RateWindow;
    uploadRoom: RateWindow;
  };
};

const DEFAULT_RATE_LIMITS: AppConfig['rateLimits'] = {
  createRoom: { limit: 20, windowMs: 15 * 60 * 1000 },
  joinRoom: { limit: 40, windowMs: 15 * 60 * 1000 },
  sendMessage: { limit: 30, windowMs: 60 * 1000 },
  uploadParticipant: { limit: 20, windowMs: 10 * 60 * 1000 },
  uploadRoom: { limit: 80, windowMs: 10 * 60 * 1000 },
};

const DEFAULT_MEDIA_LIMITS: MediaLimits = {
  image: IMAGE_MAX_BYTES,
  video: VIDEO_MAX_BYTES,
  audio: AUDIO_MAX_BYTES,
  document: DOCUMENT_MAX_BYTES,
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = readPort(env.PORT);
  const clientOrigin = readOrigin(env.CLIENT_ORIGIN);
  const sessionTtlHours = readInteger(env.SESSION_TTL_HOURS, 168, 1, 24 * 30, 'SESSION_TTL_HOURS');
  const cookieSecure = readBoolean(env.COOKIE_SECURE, false, 'COOKIE_SECURE');
  const cookieSameSite = readSameSite(env.COOKIE_SAMESITE);
  const trustProxy = readBoolean(env.TRUST_PROXY, false, 'TRUST_PROXY');
  const rateLimitEnabled = readBoolean(env.RATE_LIMIT_ENABLED, true, 'RATE_LIMIT_ENABLED');

  if (cookieSameSite === 'none' && !cookieSecure) {
    throw new Error('COOKIE_SAMESITE=none exige COOKIE_SECURE=true.');
  }

  return {
    port,
    clientOrigin,
    databasePath: resolveDatabasePath(env.DATABASE_PATH ?? 'data/chat.sqlite'),
    uploadsPath: resolveDatabasePath(env.UPLOADS_PATH ?? 'data/uploads'),
    sessionTtlMs: sessionTtlHours * 60 * 60 * 1000,
    cookieSecure,
    cookieSameSite,
    trustProxy,
    rateLimitEnabled,
    mediaLimits: DEFAULT_MEDIA_LIMITS,
    rateLimits: DEFAULT_RATE_LIMITS,
  };
}

export function resolveDatabasePath(value: string): string {
  if (value === ':memory:') return value;
  return path.isAbsolute(value) ? value : path.join(serverRoot, value);
}

function readPort(value: string | undefined): number {
  if (value === undefined || value === '') return 3001;
  if (!/^\d+$/.test(value)) throw new Error('PORT inválida.');
  const port = Number(value);
  if (port < 1 || port > 65535) throw new Error('PORT inválida.');
  return port;
}

function readOrigin(value: string | undefined): string {
  const raw = value && value.length > 0 ? value : 'http://localhost:5173';
  if (raw === '*') throw new Error('CLIENT_ORIGIN não pode ser *.');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('CLIENT_ORIGIN inválida.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('CLIENT_ORIGIN inválida.');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('CLIENT_ORIGIN deve ser apenas a origem, sem caminho ou credenciais.');
  }
  return url.origin;
}

function readInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} inválida.`);
  const parsed = Number(value);
  if (parsed < min || parsed > max) throw new Error(`${name} inválida.`);
  return parsed;
}

function readBoolean(value: string | undefined, fallback: boolean, name: string): boolean {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} deve ser true ou false.`);
}

function readSameSite(value: string | undefined): SameSite {
  if (value === undefined || value === '') return 'lax';
  if (value === 'lax' || value === 'strict' || value === 'none') return value;
  throw new Error('COOKIE_SAMESITE deve ser lax, strict ou none.');
}
