import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { boot, cookiePair, listen, resetProcessState } from './helpers.js';
import { recorderErrorMessage } from '../../client/src/services/recorderErrors.ts';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

afterEach(() => {
  resetProcessState();
});

describe('arquivos', () => {
  it('guarda imagem válida, metadados e histórico, e recusa tipo ou tamanho inválido', async () => {
    const uploadsPath = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-media-'));
    const { app, db } = boot({ uploadsPath, mediaLimits: { image: PNG.length + 8 } });
    try {
      const ana = request.agent(app);
      const created = await ana.post('/api/rooms');
      const roomId = created.body.room.id as string;
      await ana.post(`/api/rooms/${roomId}/sessions`).send({ displayName: 'Ana' });
      const clientMessageId = randomUUID();

      const uploaded = await ana
        .post(`/api/rooms/${roomId}/uploads`)
        .field('clientMessageId', clientMessageId)
        .field('kind', 'image')
        .attach('file', PNG, 'foto.png');
      expect(uploaded.status).toBe(201);
      expect(uploaded.body.message.kind).toBe('image');
      expect(uploaded.body.message.content).toBe('Foto');
      expect(uploaded.body.message.attachment).toMatchObject({
        mediaType: 'image',
        mimeType: 'image/png',
        fileName: 'foto.png',
        sizeBytes: PNG.length,
      });
      expect(JSON.stringify(uploaded.body)).not.toContain('storageKey');
      expect(JSON.stringify(uploaded.body)).not.toContain(uploadsPath);

      const attachmentId = uploaded.body.message.attachment.id as string;
      const row = db.prepare('SELECT storage_key, mime_type, size_bytes FROM attachments WHERE id = ?').get(attachmentId) as {
        storage_key: string;
        mime_type: string;
        size_bytes: number;
      };
      expect(row.mime_type).toBe('image/png');
      expect(row.size_bytes).toBe(PNG.length);
      expect(row.storage_key).toBe(`${roomId}/${attachmentId}`);
      expect(fs.existsSync(path.join(uploadsPath, roomId, attachmentId))).toBe(true);

      const history = await ana.get(`/api/rooms/${roomId}/messages`);
      expect(history.body.messages).toHaveLength(1);
      expect(history.body.messages[0].kind).toBe('image');
      expect(history.body.messages[0].attachment.fileName).toBe('foto.png');

      const download = await ana.get(`/api/rooms/${roomId}/attachments/${attachmentId}`);
      expect(download.status).toBe(200);
      expect(download.headers['content-type']).toContain('image/png');
      expect(download.headers['x-content-type-options']).toBe('nosniff');
      expect(download.headers['content-disposition']).toContain('inline');
      expect(download.headers['cache-control']).toContain('private');
      expect(Buffer.from(download.body)).toEqual(PNG);

      const forced = await ana.get(`/api/rooms/${roomId}/attachments/${attachmentId}?download=1`);
      expect(forced.headers['content-disposition']).toContain('attachment');

      const duplicate = await ana
        .post(`/api/rooms/${roomId}/uploads`)
        .field('clientMessageId', clientMessageId)
        .field('kind', 'image')
        .attach('file', PNG, 'outra.png');
      expect(duplicate.status).toBe(201);
      expect(duplicate.body.message.id).toBe(uploaded.body.message.id);
      const totals = db.prepare('SELECT COUNT(*) AS total FROM messages').get() as { total: number };
      const files = db.prepare('SELECT COUNT(*) AS total FROM attachments').get() as { total: number };
      expect(totals.total).toBe(1);
      expect(files.total).toBe(1);

      const html = Buffer.from('<html><script>alert(1)</script></html>');
      const invalid = await ana
        .post(`/api/rooms/${roomId}/uploads`)
        .field('clientMessageId', randomUUID())
        .field('kind', 'image')
        .attach('file', html, 'foto.png');
      expect(invalid.status).toBe(400);
      expect(invalid.body.code).toBe('invalid_media');

      const bulky = Buffer.concat([PNG, Buffer.alloc(32, 1)]);
      const oversize = await ana
        .post(`/api/rooms/${roomId}/uploads`)
        .field('clientMessageId', randomUUID())
        .field('kind', 'image')
        .attach('file', bulky, 'grande.png');
      expect(oversize.status).toBe(413);
      expect(oversize.body.code).toBe('file_too_large');
      expect(fs.readdirSync(path.join(uploadsPath, roomId)).filter((name) => name.endsWith('.partial'))).toEqual([]);
    } finally {
      db.close();
      fs.rmSync(uploadsPath, { recursive: true, force: true });
    }
  });

  it('exige sessão e impede leitura de arquivo de outra sala', async () => {
    const uploadsPath = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-media-'));
    const { app, db } = boot({ uploadsPath });
    try {
      const ana = request.agent(app);
      const bia = request.agent(app);
      const roomA = await ana.post('/api/rooms');
      const roomB = await bia.post('/api/rooms');
      const roomAId = roomA.body.room.id as string;
      const roomBId = roomB.body.room.id as string;
      await ana.post(`/api/rooms/${roomAId}/sessions`).send({ displayName: 'Ana' });
      await bia.post(`/api/rooms/${roomBId}/sessions`).send({ displayName: 'Bia' });
      const uploaded = await ana
        .post(`/api/rooms/${roomAId}/uploads`)
        .field('clientMessageId', randomUUID())
        .field('kind', 'document')
        .attach('file', Buffer.from('olá, texto'), 'nota.txt');
      expect(uploaded.status).toBe(201);
      const attachmentId = uploaded.body.message.attachment.id as string;

      const anonymous = await request(app).post(`/api/rooms/${roomAId}/uploads`).field('kind', 'image').attach('file', PNG, 'foto.png');
      expect(anonymous.status).toBe(401);
      const hidden = await request(app).get(`/api/rooms/${roomAId}/attachments/${attachmentId}`);
      expect(hidden.status).toBe(401);

      const otherRoom = await bia.get(`/api/rooms/${roomBId}/attachments/${attachmentId}`);
      expect(otherRoom.status).toBe(404);
      const crossed = await bia.get(`/api/rooms/${roomAId}/attachments/${attachmentId}`);
      expect(crossed.status).toBe(401);
      const traversal = await ana.get(`/api/rooms/${roomAId}/attachments/..%2F..%2Fetc%2Fpasswd`);
      expect(traversal.status).toBe(404);

      const download = await ana.get(`/api/rooms/${roomAId}/attachments/${attachmentId}?download=1`);
      expect(download.status).toBe(200);
      expect(download.headers['content-type']).toContain('text/plain');
      expect(download.headers['content-disposition']).toContain('attachment');
      expect(download.text).toBe('olá, texto');
    } finally {
      db.close();
      fs.rmSync(uploadsPath, { recursive: true, force: true });
    }
  });

  it('avisa a sala uma vez e apaga upload interrompido', async () => {
    const uploadsPath = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-media-'));
    const { app, db, config } = boot({ uploadsPath });
    const runtime = await listen(app, config, db);
    const sockets: Socket[] = [];
    try {
      const ana = request.agent(app);
      const bia = request.agent(app);
      const created = await ana.post('/api/rooms');
      const roomId = created.body.room.id as string;
      const anaJoin = await ana.post(`/api/rooms/${roomId}/sessions`).send({ displayName: 'Ana' });
      const biaJoin = await bia.post(`/api/rooms/${roomId}/sessions`).send({ displayName: 'Bia' });
      const biaSocket = ioClient(runtime.url, {
        transports: ['websocket'],
        reconnection: false,
        extraHeaders: { cookie: cookiePair(biaJoin.headers['set-cookie']) },
        auth: { roomId },
      });
      sockets.push(biaSocket);
      await new Promise<void>((resolve, reject) => {
        biaSocket.once('connect', () => resolve());
        biaSocket.once('connect_error', reject);
      });

      const imageEvent = new Promise<{ kind?: string; id?: string; content?: string }>((resolve) => {
        biaSocket.on('message:new', (message: { kind?: string; id?: string; content?: string }) => {
          if (message.kind === 'image') resolve(message);
        });
      });
      const textId = randomUUID();
      const textAck = await new Promise<{ ok: boolean }>((resolve, reject) => {
        const anaSocket = ioClient(runtime.url, {
          transports: ['websocket'],
          reconnection: false,
          extraHeaders: { cookie: cookiePair(anaJoin.headers['set-cookie']) },
          auth: { roomId },
        });
        sockets.push(anaSocket);
        anaSocket.on('connect', () => {
          anaSocket.timeout(5000).emit('message:send', { clientMessageId: textId, content: 'texto antigo' }, (error: unknown, response: unknown) => {
            if (error) reject(error instanceof Error ? error : new Error('sem texto'));
            else resolve(response as { ok: boolean });
          });
        });
      });
      expect(textAck.ok).toBe(true);

      const uploaded = await ana
        .post(`/api/rooms/${roomId}/uploads`)
        .field('clientMessageId', randomUUID())
        .field('kind', 'image')
        .attach('file', PNG, 'foto.png');
      expect(uploaded.status).toBe(201);
      const incoming = await imageEvent;
      expect(incoming.kind).toBe('image');
      expect(incoming.content).toBe('Foto');

      const imageEvents: string[] = [];
      biaSocket.on('message:new', (message: { kind?: string; id?: string }) => {
        if (message.kind === 'image' && message.id !== incoming.id) imageEvents.push(message.id ?? '');
      });
      await ana
        .post(`/api/rooms/${roomId}/uploads`)
        .field('clientMessageId', uploaded.body.message.clientMessageId as string)
        .field('kind', 'image')
        .attach('file', PNG, 'foto.png');
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(imageEvents).toEqual([]);

      const history = await ana.get(`/api/rooms/${roomId}/messages`);
      expect(history.body.messages.map((item: { content: string }) => item.content)).toEqual(['texto antigo', 'Foto']);

      const boundary = '----orbeboundary';
      const head =
        `--${boundary}\r\nContent-Disposition: form-data; name="clientMessageId"\r\n\r\n${randomUUID()}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\nimage\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="parcial.png"\r\nContent-Type: image/png\r\n\r\n`;
      await new Promise<void>((resolve) => {
        const target = new URL(runtime.url);
        const req = http.request({
          hostname: target.hostname,
          port: target.port,
          path: `/api/rooms/${roomId}/uploads`,
          method: 'POST',
          headers: {
            cookie: cookiePair(anaJoin.headers['set-cookie']),
            'content-type': `multipart/form-data; boundary=${boundary}`,
          },
        });
        req.on('error', () => resolve());
        req.write(head);
        req.write(PNG.subarray(0, 8));
        req.destroy();
        setTimeout(resolve, 150);
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      const names = fs.existsSync(path.join(uploadsPath, roomId)) ? fs.readdirSync(path.join(uploadsPath, roomId)) : [];
      expect(names.filter((name) => name.endsWith('.partial'))).toEqual([]);
      const files = db.prepare('SELECT COUNT(*) AS total FROM attachments').get() as { total: number };
      expect(files.total).toBe(1);
    } finally {
      for (const socket of sockets) socket.disconnect();
      await runtime.close();
      db.close();
      fs.rmSync(uploadsPath, { recursive: true, force: true });
    }
  });

  it('aceita pdf, docx, mp4 e webm e recusa html disfarçado de texto', async () => {
    const uploadsPath = fs.mkdtempSync(path.join(os.tmpdir(), 'orbe-media-'));
    const { app, db } = boot({ uploadsPath });
    try {
      const ana = request.agent(app);
      const created = await ana.post('/api/rooms');
      const roomId = created.body.room.id as string;
      await ana.post(`/api/rooms/${roomId}/sessions`).send({ displayName: 'Ana' });

      const pdf = await upload(ana, roomId, 'document', Buffer.from('%PDF-1.4\n1 0 obj\n'), 'contrato.pdf');
      expect(pdf.body.message.attachment.mimeType).toBe('application/pdf');
      const docx = await upload(ana, roomId, 'document', storedZip([{ name: 'word/document.xml', data: Buffer.from('<w:document/>') }]), 'carta.docx');
      expect(docx.body.message.attachment.mimeType).toContain('wordprocessingml');
      const mp4 = Buffer.alloc(16);
      mp4.writeUInt32BE(16, 0);
      mp4.write('ftypisom', 4, 'ascii');
      const video = await upload(ana, roomId, 'video', mp4, 'clipe.mp4');
      expect(video.body.message.kind).toBe('video');
      const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('webm')]);
      const audio = await upload(ana, roomId, 'audio', webm, 'voz.webm', '1200');
      expect(audio.body.message.attachment).toMatchObject({ mimeType: 'audio/webm', durationMs: 1200 });
      const tooLong = await upload(ana, roomId, 'audio', webm, 'voz.webm', '400000');
      expect(tooLong.status).toBe(400);
      expect(tooLong.body.code).toBe('audio_too_long');
      const html = await upload(ana, roomId, 'document', Buffer.from('<html><script>alert(1)</script></html>'), 'nota.txt');
      expect(html.status).toBe(400);
      expect(html.body.code).toBe('invalid_media');
    } finally {
      db.close();
      fs.rmSync(uploadsPath, { recursive: true, force: true });
    }
  });

  it('explica falha de microfone', () => {
    expect(recorderErrorMessage({ name: 'NotAllowedError' })).toMatch(/permitido/i);
    expect(recorderErrorMessage({ name: 'NotFoundError' })).toMatch(/microfone/i);
    expect(recorderErrorMessage({ name: 'NotReadableError' })).toMatch(/uso/i);
    expect(recorderErrorMessage(new Error('x'))).toMatch(/não foi possível gravar/i);
  });
});

function upload(
  agent: ReturnType<typeof request.agent>,
  roomId: string,
  kind: string,
  file: Buffer,
  filename: string,
  durationMs?: string,
) {
  const requestUpload = agent
    .post(`/api/rooms/${roomId}/uploads`)
    .field('clientMessageId', randomUUID())
    .field('kind', kind);
  if (durationMs) requestUpload.field('durationMs', durationMs);
  return requestUpload.attach('file', file, filename);
}

function storedZip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    name.copy(local, 30);
    const stored = Buffer.concat([local, file.data]);
    locals.push(stored);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += stored.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, eocd]);
}
