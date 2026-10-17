import { createHash, randomBytes } from 'node:crypto';
import { ROOM_ID_BYTES } from '../constants.js';

const OPAQUE_ID = /^[A-Za-z0-9_-]{43}$/;

export function createOpaqueId(): string {
  return randomBytes(ROOM_ID_BYTES).toString('base64url');
}

export function isOpaqueId(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE_ID.test(value);
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
