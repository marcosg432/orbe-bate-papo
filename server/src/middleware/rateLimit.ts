import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config.js';
import { consumeRateLimit } from '../services/rateLimit.js';

export function limitRequests(
  config: AppConfig,
  options: { name: string; limit: number; windowMs: number },
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!config.rateLimitEnabled) {
      next();
      return;
    }
    const ip = req.ip || 'unknown';
    const allowed = consumeRateLimit(`${options.name}:${ip}`, options.limit, options.windowMs);
    if (!allowed) {
      res.status(429).json({
        error: 'Muitas tentativas. Aguarde um instante e tente novamente.',
        code: 'rate_limited',
      });
      return;
    }
    next();
  };
}
