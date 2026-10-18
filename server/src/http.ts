import { createServer, type Server as HttpServer } from 'node:http';
import type { Express } from 'express';
import type { AppConfig } from './config.js';
import type { AppDatabase } from './database/db.js';
import { createChatServer, roomChannel, type ChatServer } from './sockets/chat.js';
import { bindMessageSink } from './services/realtime.js';

export function createHttpServer(app: Express, config: AppConfig, db: AppDatabase): { httpServer: HttpServer; io: ChatServer } {
  const httpServer = createServer();
  const io = createChatServer(httpServer, config, db);
  bindMessageSink((roomId, message) => {
    io.to(roomChannel(roomId)).emit('message:new', message);
  });
  httpServer.on('request', (req, res) => {
    const pathname = (req.url ?? '').split('?')[0] ?? '';
    if (pathname.startsWith('/socket.io')) return;
    app(req, res);
  });
  return { httpServer, io };
}
