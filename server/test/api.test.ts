import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { listMessages } from '../src/services/messages.js';
import { boot, cookiePair, createJoinedRoom, resetProcessState } from './helpers.js';

afterEach(() => {
  resetProcessState();
});

describe('API de salas', () => {
  it('cria sala, exige sessão e isola o histórico', async () => {
    const { app, db } = boot();
    const logs: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((item) => String(item)).join(' '));
    };
    try {
      const agent = request.agent(app);
      const created = await agent.post('/api/rooms');
      const anonymous = await request(app).get(`/api/rooms/${created.body.room?.id ?? 'missing'}`);
      const joined = created.status === 201
        ? await agent.post(`/api/rooms/${created.body.room.id}/sessions`).send({ displayName: 'Ana' })
        : null;

      expect(created.status).toBe(201);
      const roomId = created.body.room.id as string;
      expect(anonymous.status).toBe(401);
      expect(anonymous.body.messages).toBeUndefined();
      expect(joined?.status).toBe(201);
      const token = cookiePair(joined?.headers['set-cookie']).split('=')[1];
      expect(logs.join('\n')).not.toContain(roomId);
      expect(logs.join('\n')).not.toContain(token ?? 'token-ausente');
      expect(created.body.room).not.toHaveProperty('messages');
      const stored = db.prepare('SELECT device_hash FROM sessions').get() as { device_hash: string };
      expect(stored.device_hash).not.toBe(token);
      expect(stored.device_hash).toHaveLength(64);

      const resumed = await agent.post(`/api/rooms/${roomId}/sessions`).send({ displayName: 'Outra pessoa' });
      expect(resumed.status).toBe(200);
      expect(resumed.body.participant.displayName).toBe('Ana');
      expect(resumed.body.participant.id).toBe(joined.body.participant.id);

      const room = await agent.get(`/api/rooms/${roomId}`);
      expect(room.status).toBe(200);
      expect(room.body.participant.displayName).toBe('Ana');

      const other = await agent.post('/api/rooms');
      const otherId = other.body.room.id as string;
      const blocked = await agent.get(`/api/rooms/${otherId}/messages`);
      expect(blocked.status).toBe(401);

      const joinedOther = await agent.post(`/api/rooms/${otherId}/sessions`).send({ displayName: 'Bia' });
      expect(joinedOther.status).toBe(201);
      expect(joinedOther.body.participant.id).not.toBe(joined?.body.participant.id);
      const stillThere = await agent.get(`/api/rooms/${roomId}/messages`);
      expect(stillThere.status).toBe(200);
    } finally {
      console.log = original;
      db.close();
    }
  });

  it('não lista salas e rejeita link, nome e JSON inválidos', async () => {
    const { app, db } = boot();
    try {
      expect((await request(app).get('/api/rooms')).status).toBe(404);
      expect((await request(app).get('/api/health')).body).toEqual({ ok: true });
      expect((await request(app).get('/api/rooms/curto')).status).toBe(404);
      const { roomId } = await createJoinedRoom(request.agent(app), 'Ana');
      const badName = await request(app).post(`/api/rooms/${roomId}/sessions`).send({ displayName: 'A' });
      expect(badName.status).toBe(400);
      const badJson = await request(app)
        .post(`/api/rooms/${roomId}/sessions`)
        .set('Content-Type', 'application/json')
        .send('{"displayName":');
      expect(badJson.status).toBe(400);
    } finally {
      db.close();
    }
  });

  it('restringe o CORS à origem configurada', async () => {
    const { app, db } = boot();
    try {
      const evil = await request(app).get('/api/health').set('Origin', 'http://evil.example');
      expect(evil.headers['access-control-allow-origin']).not.toBe('http://evil.example');
      const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
      expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    } finally {
      db.close();
    }
  });

  it('aplica limite na criação de salas', async () => {
    const { app, db } = boot({
      rateLimitEnabled: true,
      rateLimits: {
        createRoom: { limit: 2, windowMs: 60_000 },
        joinRoom: { limit: 10, windowMs: 60_000 },
        sendMessage: { limit: 10, windowMs: 60_000 },
      },
    });
    try {
      expect((await request(app).post('/api/rooms')).status).toBe(201);
      expect((await request(app).post('/api/rooms')).status).toBe(201);
      const blocked = await request(app).post('/api/rooms');
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe('rate_limited');
    } finally {
      db.close();
    }
  });

  it('mantém o histórico depois de reabrir o banco', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-'));
    const databasePath = path.join(dir, 'chat.sqlite');
    const first = boot({ databasePath });
    try {
      const agent = request.agent(first.app);
      const { roomId, joined } = await createJoinedRoom(agent, 'Ana');
      const participantId = joined.body.participant.id as string;
      first.db
        .prepare(
          `INSERT INTO messages (id, room_id, participant_id, display_name, content, client_message_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('00000000-0000-4000-8000-000000000001', roomId, participantId, 'Ana', 'primeira', '00000000-0000-4000-8000-000000000011', '2020-01-01T00:00:00.000Z');
      first.db
        .prepare(
          `INSERT INTO messages (id, room_id, participant_id, display_name, content, client_message_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('ffffffff-ffff-4fff-bfff-ffffffffffff', roomId, participantId, 'Ana', 'segunda', 'ffffffff-ffff-4fff-bfff-fffffffffffe', '2020-01-01T00:00:00.000Z');
    } finally {
      first.db.close();
    }

    const second = boot({ databasePath });
    try {
      const agent = request.agent(second.app);
      const rooms = second.db.prepare('SELECT id FROM rooms').all() as { id: string }[];
      const roomId = rooms[0]?.id;
      expect(roomId).toBeTruthy();
      await agent.post(`/api/rooms/${roomId}/sessions`).send({ displayName: 'Ana' });
      const history = await agent.get(`/api/rooms/${roomId}/messages?limit=1`);
      expect(history.status).toBe(200);
      expect(history.body.hasMore).toBe(true);
      expect(history.body.messages).toHaveLength(1);
      expect(history.body.messages[0].content).toBe('segunda');
      const page = listMessages(second.db, roomId as string, { limit: 10 });
      expect(page.messages.map((item) => item.content)).toEqual(['primeira', 'segunda']);
    } finally {
      second.db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
