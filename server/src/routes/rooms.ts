import { Router, type RequestHandler } from 'express';
import type { AppConfig } from '../config.js';
import { COOKIE_NAME, HISTORY_MAX_PAGE_SIZE, HISTORY_PAGE_SIZE } from '../constants.js';
import type { AppDatabase } from '../database/db.js';
import { limitRequests } from '../middleware/rateLimit.js';
import { requireSession } from '../middleware/requireSession.js';
import { listMessages } from '../services/messages.js';
import { createRoom, findRoom } from '../services/rooms.js';
import { joinRoom } from '../services/sessions.js';
import { cookieOptions, readRequestToken } from '../utils/cookies.js';
import { HttpError, readParam, readQuery } from '../utils/http.js';
import { createOpaqueId, isOpaqueId } from '../utils/ids.js';
import { logger } from '../utils/logger.js';
import { joinBodySchema, parseCursor, parseLimit, parseWith } from '../utils/validation.js';

export function createRoomsRouter(db: AppDatabase, config: AppConfig): Router {
  const router = Router();
  const authorize = requireSession(db, config);

  router.post(
    '/',
    limitRequests(config, { name: 'create-room', ...config.rateLimits.createRoom }),
    asyncRoute((_req, res) => {
      const room = createRoom(db);
      logger.info('room created');
      res.status(201).json({ room });
      return Promise.resolve();
    }),
  );

  router.post(
    '/:roomId/sessions',
    limitRequests(config, { name: 'join-room', ...config.rateLimits.joinRoom }),
    asyncRoute(async (req, res) => {
      const roomId = readParam(req.params.roomId);
      if (!isOpaqueId(roomId) || !findRoom(db, roomId)) {
        throw new HttpError(404, 'Conversa não encontrada.', 'room_not_found');
      }
      const { displayName } = parseWith(joinBodySchema, req.body);
      const existingToken = readRequestToken(req);
      const token = existingToken ?? createOpaqueId();
      const result = joinRoom(db, config, { token, roomId, displayName });
      res.cookie(COOKIE_NAME, token, cookieOptions(config));
      res.status(result.created ? 201 : 200).json({
        room: result.room,
        participant: result.participant,
        expiresAt: result.expiresAt,
      });
    }),
  );

  router.get('/:roomId', authorize, asyncRoute(async (req, res) => {
    const auth = req.auth;
    if (!auth) throw new HttpError(401, 'Entre com um nome para acessar esta conversa.', 'unauthorized');
    const room = findRoom(db, auth.roomId);
    if (!room) throw new HttpError(404, 'Conversa não encontrada.', 'room_not_found');
    res.json({
      room,
      participant: { id: auth.participantId, displayName: auth.displayName },
      expiresAt: auth.expiresAt,
    });
  }));

  router.get('/:roomId/messages', authorize, asyncRoute(async (req, res) => {
    const auth = req.auth;
    if (!auth) throw new HttpError(401, 'Entre com um nome para acessar esta conversa.', 'unauthorized');
    const limit = parseLimit(readQuery(req.query.limit), HISTORY_PAGE_SIZE, HISTORY_MAX_PAGE_SIZE);
    const before = parseCursor(readQuery(req.query.beforeCreatedAt), readQuery(req.query.beforeId));
    const page = listMessages(db, auth.roomId, { limit, before });
    res.json(page);
  }));

  return router;
}

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
}
