import type { CookieOptions, Request, Response } from 'express';
import { COOKIE_NAME } from '../constants.js';
import type { AppConfig } from '../config.js';
import { isOpaqueId } from './ids.js';

export function cookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
    maxAge: config.sessionTtlMs,
  };
}

export function readCookieHeader(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const parts = header.split(';');
  for (const part of parts) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const raw = part.slice(separator + 1).trim();
    if (!raw) return undefined;
    try {
      return decodeURIComponent(raw);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function readRequestToken(req: Request): string | undefined {
  const value: unknown = req.cookies?.[COOKIE_NAME];
  return typeof value === 'string' && isOpaqueId(value) ? value : undefined;
}

export function clearDeviceCookie(res: Response, config: AppConfig): void {
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
  });
}
