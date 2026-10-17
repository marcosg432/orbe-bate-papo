import { z } from 'zod';
import { MESSAGE_MAX_LENGTH, NAME_MAX_LENGTH, NAME_MIN_LENGTH } from '../constants.js';
import { HttpError } from './http.js';

const NAME_PATTERN =
  /^(?=.*[\p{L}\p{N}])[^<>\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]+$/u;

const MESSAGE_PATTERN = /^[^\u0000\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]+$/u;

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const displayNameSchema = z
  .string()
  .trim()
  .min(NAME_MIN_LENGTH, 'O nome precisa ter pelo menos 2 caracteres.')
  .max(NAME_MAX_LENGTH, 'O nome pode ter no máximo 40 caracteres.')
  .regex(NAME_PATTERN, 'O nome contém caracteres inválidos.');

export const messageContentSchema = z
  .string()
  .trim()
  .min(1, 'Escreva uma mensagem.')
  .max(MESSAGE_MAX_LENGTH, 'A mensagem pode ter no máximo 2000 caracteres.')
  .regex(MESSAGE_PATTERN, 'A mensagem contém caracteres inválidos.');

export const clientMessageIdSchema = z.uuid('Identificador de envio inválido.');

export const sendMessageSchema = z.object({
  clientMessageId: clientMessageIdSchema,
  content: messageContentSchema,
});

export const joinBodySchema = z.object({
  displayName: displayNameSchema,
});

export function parseWith<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, result.error.issues[0]?.message ?? 'Dados inválidos.', 'invalid_input');
  }
  return result.data;
}

export function parseCursor(createdAt: string | undefined, id: string | undefined): { createdAt: string; id: string } | undefined {
  if (createdAt === undefined && id === undefined) return undefined;
  if (!createdAt || !id || !ISO_TIMESTAMP.test(createdAt) || !z.uuid().safeParse(id).success) {
    throw new HttpError(400, 'Cursor de histórico inválido.', 'invalid_cursor');
  }
  return { createdAt, id };
}

export function parseLimit(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new HttpError(400, 'Limite inválido.', 'invalid_input');
  const limit = Number(value);
  if (limit < 1 || limit > max) throw new HttpError(400, 'Limite inválido.', 'invalid_input');
  return limit;
}
