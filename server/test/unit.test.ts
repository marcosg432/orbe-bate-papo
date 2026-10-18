import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { ROOM_ID_BYTES } from '../src/constants.js';
import { openDatabase } from '../src/database/db.js';
import { createOpaqueId, hashSecret, isOpaqueId } from '../src/utils/ids.js';
import { redact } from '../src/utils/logger.js';
import { displayNameSchema, messageContentSchema } from '../src/utils/validation.js';
import { consumeRateLimit, clearRateLimits } from '../src/services/rateLimit.js';
import { loadConfig } from '../src/config.js';
import { isOriginAllowed } from '../src/utils/origin.js';

describe('banco', () => {
  it('acrescenta a coluna de resposta em um banco já existente', () => {
    const file = path.join(os.tmpdir(), `orbe-migrate-${Date.now()}.sqlite`);
    const legacy = new Database(file);
    legacy.exec(`
      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        content TEXT NOT NULL,
        client_message_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    legacy.close();
    const db = openDatabase(file);
    const columns = db.prepare('PRAGMA table_info(messages)').all() as { name: string }[];
    expect(columns.some((column) => column.name === 'reply_to_id')).toBe(true);
    db.close();
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${file}${suffix}`, { force: true });
  });
});

describe('identificadores', () => {
  it('gera 256 bits em base64url, acima do mínimo de 128', () => {
    expect(ROOM_ID_BYTES * 8).toBeGreaterThanOrEqual(128);
    const ids = new Set<string>();
    for (let index = 0; index < 50; index += 1) {
      const id = createOpaqueId();
      expect(isOpaqueId(id)).toBe(true);
      expect(Buffer.from(id, 'base64url')).toHaveLength(ROOM_ID_BYTES);
      expect(id).not.toMatch(/^\d+$/);
      ids.add(id);
    }
    expect(ids.size).toBe(50);
  });

  it('guarda apenas o hash do token', () => {
    const token = createOpaqueId();
    const hash = hashSecret(token);
    expect(hash).not.toBe(token);
    expect(hash).toHaveLength(64);
  });
});

describe('validação', () => {
  it('rejeita nomes curtos, HTML e aceita nomes com acento', () => {
    expect(displayNameSchema.safeParse('A').success).toBe(false);
    expect(displayNameSchema.safeParse('<b>Ana</b>').success).toBe(false);
    expect(displayNameSchema.safeParse('  José  ').success).toBe(true);
    expect(displayNameSchema.safeParse('  José  ').data).toBe('José');
  });

  it('limita mensagens e preserva texto com marcação', () => {
    expect(messageContentSchema.safeParse('   ').success).toBe(false);
    expect(messageContentSchema.safeParse('a'.repeat(2001)).success).toBe(false);
    const markup = '<script>alert(1)</script>';
    const parsed = messageContentSchema.safeParse(markup);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe(markup);
  });
});

describe('limites e configuração', () => {
  it('bloqueia depois do limite da janela', () => {
    clearRateLimits();
    expect(consumeRateLimit('teste', 2, 1000, 0)).toBe(true);
    expect(consumeRateLimit('teste', 2, 1000, 10)).toBe(true);
    expect(consumeRateLimit('teste', 2, 1000, 20)).toBe(false);
    expect(consumeRateLimit('teste', 2, 1000, 1001)).toBe(true);
  });

  it('recusa origem coringa e sameSite none sem secure', () => {
    expect(() => loadConfig({ CLIENT_ORIGIN: '*' })).toThrow(/CLIENT_ORIGIN/);
    expect(() => loadConfig({ COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    const config = loadConfig({});
    expect(config.port).toBe(3001);
    expect(config.clientOrigin).toBe('http://localhost:5173');
  });

  it('aceita a origem configurada e o mesmo host da requisição', () => {
    expect(isOriginAllowed(undefined, '203.0.113.10:3041', 'http://127.0.0.1:3041')).toBe(true);
    expect(isOriginAllowed('http://203.0.113.10:3041', '203.0.113.10:3041', 'http://127.0.0.1:3041')).toBe(true);
    expect(isOriginAllowed('http://localhost:5173', '127.0.0.1:3001', 'http://localhost:5173')).toBe(true);
    expect(isOriginAllowed('http://evil.example', '203.0.113.10:3041', 'http://127.0.0.1:3041')).toBe(false);
  });

  it('não copia segredos para o log', () => {
    expect(redact({ token: 'segredo', roomId: 'sala', port: 3001 })).toEqual({ port: 3001 });
  });
});
