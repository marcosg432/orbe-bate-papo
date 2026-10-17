import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { boot, cookiePair, listen, resetProcessState, testConfig } from './helpers.js';
import type { SendAck } from '../src/types/events.js';

afterEach(() => {
  resetProcessState();
});

describe('tempo real', () => {
  it('entrega, confirma, deduplica e isola as salas', async () => {
    const config = testConfig();
    const { app, db } = boot(config);
    const runtime = await listen(app, config, db);
    const sockets: Socket[] = [];
    try {
      const ana = request.agent(app);
      const bia = request.agent(app);
      const roomA = await ana.post('/api/rooms');
      const roomB = await ana.post('/api/rooms');
      const roomAId = roomA.body.room.id as string;
      const roomBId = roomB.body.room.id as string;
      const anaJoin = await ana.post(`/api/rooms/${roomAId}/sessions`).send({ displayName: 'Ana' });
      const biaJoin = await bia.post(`/api/rooms/${roomAId}/sessions`).send({ displayName: 'Ana' });
      await bia.post(`/api/rooms/${roomBId}/sessions`).send({ displayName: 'Bia' });

      const anaSocket = connect(runtime.url, cookiePair(anaJoin.headers['set-cookie']), roomAId);
      const biaSocket = connect(runtime.url, cookiePair(biaJoin.headers['set-cookie']), roomBId);
      sockets.push(anaSocket, biaSocket);
      await Promise.all([waitConnect(anaSocket), waitConnect(biaSocket)]);

      const seenByAna = waitEvent<{ participants: { id: string }[] }>(anaSocket, 'presence:update');
      const biaInA = connect(runtime.url, cookiePair(biaJoin.headers['set-cookie']), roomAId);
      sockets.push(biaInA);
      await waitConnect(biaInA);
      await expect(seenByAna).resolves.toMatchObject({ participants: expect.any(Array) });

      const clientMessageId = randomUUID();
      const markup = '<img src=x onerror=alert(1)>';
      const delivered = waitEvent<{ content: string; id: string }>(biaInA, 'message:new');
      const leaked = Promise.race([
        waitEvent(biaSocket, 'message:new').then(() => 'leaked'),
        new Promise((resolve) => setTimeout(() => resolve('isolated'), 300)),
      ]);
      const ack = await send(anaSocket, clientMessageId, markup);
      expect(ack.ok).toBe(true);
      if (!ack.ok) return;
      const incoming = await delivered;
      expect(incoming.content).toBe(markup);
      expect(incoming.id).toBe(ack.message.id);
      expect(await leaked).toBe('isolated');

      const duplicate = await send(anaSocket, clientMessageId, markup);
      expect(duplicate.ok).toBe(true);
      if (duplicate.ok) expect(duplicate.message.id).toBe(ack.message.id);
      const count = db.prepare('SELECT COUNT(*) AS total FROM messages').get() as { total: number };
      expect(count.total).toBe(1);

      const conflict = await send(biaInA, clientMessageId, 'outra');
      expect(conflict.ok).toBe(false);
      if (!conflict.ok) expect(conflict.code).toBe('duplicate_client_id');

      const tooLong = await send(anaSocket, randomUUID(), 'a'.repeat(2001));
      expect(tooLong.ok).toBe(false);

      const history = await ana.get(`/api/rooms/${roomAId}/messages`);
      expect(history.body.messages[0].content).toBe(markup);
      expect(history.headers['content-type']).toContain('application/json');

      const stranger = connect(runtime.url, '', roomAId);
      sockets.push(stranger);
      const failure = await waitError(stranger);
      expect(failure.message).toBe('unauthorized');
    } finally {
      for (const socket of sockets) socket.disconnect();
      await runtime.close();
      db.close();
    }
  });

  it('recusa origem não autorizada no socket', async () => {
    const config = testConfig();
    const { app, db } = boot(config);
    const runtime = await listen(app, config, db);
    try {
      const denied = await fetch(`${runtime.url}/socket.io/?EIO=4&transport=polling`, {
        headers: { Origin: 'http://evil.example' },
      });
      expect(denied.status).toBe(403);

      const allowed = await fetch(`${runtime.url}/socket.io/?EIO=4&transport=polling`, {
        headers: { Origin: config.clientOrigin },
      });
      expect(allowed.status).toBe(200);
    } finally {
      await runtime.close();
      db.close();
    }
  });
});

function connect(url: string, cookie: string, roomId: string): Socket {
  return ioClient(url, {
    transports: ['websocket'],
    reconnection: false,
    withCredentials: true,
    auth: { roomId },
    extraHeaders: cookie ? { cookie } : undefined,
  });
}

function waitConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error) => reject(error));
  });
}

function waitEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => {
    socket.once(event, (payload: T) => resolve(payload));
  });
}

function waitError(socket: Socket): Promise<Error> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => reject(new Error('conectou sem autorização')));
    socket.once('connect_error', (error) => resolve(error));
  });
}

function send(socket: Socket, clientMessageId: string, content: string): Promise<SendAck> {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit('message:send', { clientMessageId, content }, (error: unknown, response: unknown) => {
      if (error) {
        reject(error instanceof Error ? error : new Error('sem confirmação'));
        return;
      }
      resolve(response as SendAck);
    });
  });
}
