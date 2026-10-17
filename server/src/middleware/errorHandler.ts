import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../utils/http.js';
import { logger } from '../utils/logger.js';

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;
  if (error instanceof HttpError) {
    if (error.status >= 500) {
      logger.error('request failed', { status: error.status, code: error.code });
    }
    res.status(error.status).json({ error: error.message, code: error.code });
    return;
  }
  if (isPayloadTooLarge(error)) {
    res.status(413).json({ error: 'Conteúdo grande demais.', code: 'payload_too_large' });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: 'JSON inválido.', code: 'invalid_json' });
    return;
  }
  logger.error('unexpected error', { name: error instanceof Error ? error.name : 'Error' });
  res.status(500).json({ error: 'Erro interno do servidor.', code: 'internal_error' });
}

function isPayloadTooLarge(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const status = 'status' in error ? error.status : undefined;
  const type = 'type' in error ? error.type : undefined;
  return status === 413 || type === 'entity.too.large';
}
