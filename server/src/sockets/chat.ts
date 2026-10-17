import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { AppConfig } from '../config.js';
import type { AppDatabase } from '../database/db.js';
import { appendMessage } from '../services/messages.js';
import { presenceJoin, presenceLeave } from '../services/presence.js';
import { consumeRateLimit } from '../services/rateLimit.js';
import { getSessionById, resolveSession } from '../services/sessions.js';
import type { ClientToServerEvents, SendAck, ServerToClientEvents, SocketData } from '../types/events.js';
import { COOKIE_NAME } from '../constants.js';
import { readCookieHeader } from '../utils/cookies.js';
import { HttpError } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { isOriginAllowed } from '../utils/origin.js';
import { isOpaqueId } from '../utils/ids.js';
import { parseWith, sendMessageSchema } from '../utils/validation.js';

export type ChatServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export function attachChatSocket(io: ChatServer, db: AppDatabase, config: AppConfig): void {
  io.use((socket, next) => {
    try {
      const roomId: unknown = socket.handshake.auth?.roomId;
      const token = readCookieHeader(socket.handshake.headers.cookie, COOKIE_NAME);
      if (!isOpaqueId(roomId) || !token) {
        next(new Error('unauthorized'));
        return;
      }
      const auth = resolveSession(db, config, token, roomId);
      if (!auth) {
        next(new Error('unauthorized'));
        return;
      }
      socket.data = {
        sessionId: auth.sessionId,
        roomId: auth.roomId,
        participantId: auth.participantId,
        displayName: auth.displayName,
      };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const channel = roomChannel(socket.data.roomId);
    socket.join(channel);
    const participants = presenceJoin(socket.data.roomId, socket.data.participantId, socket.data.displayName);
    io.to(channel).emit('presence:update', { participants });

    socket.on('message:send', (payload, ack) => {
      const respond = (response: SendAck) => {
        if (typeof ack === 'function') ack(response);
      };
      try {
        const session = getSessionById(db, socket.data.sessionId);
        if (!session || session.roomId !== socket.data.roomId) {
          respond({ ok: false, error: 'Sua sessão expirou. Entre novamente.', code: 'session_expired' });
          socket.emit('session:expired');
          socket.disconnect(true);
          return;
        }
        const body = parseWith(sendMessageSchema, payload);
        if (
          config.rateLimitEnabled &&
          !consumeRateLimit(
            `message:${socket.data.participantId}`,
            config.rateLimits.sendMessage.limit,
            config.rateLimits.sendMessage.windowMs,
          )
        ) {
          respond({
            ok: false,
            error: 'Você está enviando mensagens rápido demais.',
            code: 'rate_limited',
          });
          return;
        }
        const message = appendMessage(db, {
          roomId: socket.data.roomId,
          participantId: socket.data.participantId,
          displayName: socket.data.displayName,
          content: body.content,
          clientMessageId: body.clientMessageId,
        });
        io.to(channel).emit('message:new', message);
        respond({ ok: true, message });
      } catch (error) {
        if (error instanceof HttpError) {
          respond({ ok: false, error: error.message, code: error.code });
          return;
        }
        logger.error('send failed', { name: error instanceof Error ? error.name : 'Error' });
        respond({ ok: false, error: 'Não foi possível enviar a mensagem.', code: 'send_failed' });
      }
    });

    socket.on('disconnect', () => {
      const remaining = presenceLeave(socket.data.roomId, socket.data.participantId);
      io.to(channel).emit('presence:update', { participants: remaining });
    });
  });
}

export function roomChannel(roomId: string): string {
  return `room:${roomId}`;
}

export function createChatServer(httpServer: HttpServer, config: AppConfig, db: AppDatabase): ChatServer {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin, undefined, config.clientOrigin)) callback(null, true);
        else callback(null, false);
      },
      credentials: true,
    },
    allowRequest: (req, callback) => {
      const header = req.headers.origin;
      const origin = Array.isArray(header) ? header[0] : header;
      const host = req.headers.host;
      if (!isOriginAllowed(origin, host, config.clientOrigin)) {
        callback('origin', false);
        return;
      }
      callback(null, true);
    },
    maxHttpBufferSize: 32_000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false,
    },
  });
  attachChatSocket(io, db, config);
  return io;
}
