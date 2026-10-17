import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AppConfig } from '../config.js';
import { COOKIE_NAME } from '../constants.js';
import type { AppDatabase } from '../database/db.js';
import { resolveSession } from '../services/sessions.js';
import { cookieOptions, readRequestToken } from '../utils/cookies.js';
import { HttpError, readParam } from '../utils/http.js';
import { isOpaqueId } from '../utils/ids.js';

export function requireSession(db: AppDatabase, config: AppConfig): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const roomId = readParam(req.params.roomId);
      if (!isOpaqueId(roomId)) {
        throw new HttpError(404, 'Conversa não encontrada.', 'room_not_found');
      }
      const token = readRequestToken(req);
      if (!token) {
        throw new HttpError(401, 'Entre com um nome para acessar esta conversa.', 'unauthorized');
      }
      const auth = resolveSession(db, config, token, roomId);
      if (!auth) {
        throw new HttpError(401, 'Entre com um nome para acessar esta conversa.', 'unauthorized');
      }
      if (auth.refreshed) {
        _res.cookie(COOKIE_NAME, token, cookieOptions(config));
      }
      req.auth = auth;
      next();
    } catch (error) {
      next(error);
    }
  };
}
