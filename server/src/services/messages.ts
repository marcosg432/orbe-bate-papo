import { randomUUID } from 'node:crypto';
import type { AppDatabase } from '../database/db.js';
import { HttpError } from '../utils/http.js';

export type ReplyPreview = {
  id: string;
  participantId: string;
  displayName: string;
  content: string;
};

export type Message = {
  id: string;
  roomId: string;
  participantId: string;
  displayName: string;
  content: string;
  clientMessageId: string;
  createdAt: string;
  replyTo: ReplyPreview | null;
};

export type MessagePage = {
  messages: Message[];
  hasMore: boolean;
};

type MessageRow = {
  id: string;
  room_id: string;
  participant_id: string;
  display_name: string;
  content: string;
  client_message_id: string;
  created_at: string;
  reply_id: string | null;
  reply_participant_id: string | null;
  reply_display_name: string | null;
  reply_content: string | null;
};

const MESSAGE_SELECT = `
  SELECT
    m.id, m.room_id, m.participant_id, m.display_name, m.content, m.client_message_id, m.created_at,
    parent.id AS reply_id,
    parent.participant_id AS reply_participant_id,
    parent.display_name AS reply_display_name,
    parent.content AS reply_content
  FROM messages AS m
  LEFT JOIN messages AS parent ON parent.id = m.reply_to_id AND parent.room_id = m.room_id
`;

export function appendMessage(
  db: AppDatabase,
  input: {
    roomId: string;
    participantId: string;
    displayName: string;
    content: string;
    clientMessageId: string;
    replyToId?: string;
  },
): Message {
  const insert = db.transaction((): Message => {
    const existing = findByClientId(db, input.roomId, input.clientMessageId);
    if (existing) {
      if (existing.participant_id !== input.participantId) {
        throw new HttpError(409, 'Identificador de envio já utilizado.', 'duplicate_client_id');
      }
      return mapMessage(existing);
    }

    const replyToId = input.replyToId ?? null;
    if (replyToId && !findById(db, input.roomId, replyToId)) {
      throw new HttpError(400, 'A mensagem respondida não está nesta conversa.', 'invalid_reply');
    }

    const messageId = randomUUID();
    const createdAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO messages (
        id, room_id, participant_id, display_name, content, client_message_id, reply_to_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      messageId,
      input.roomId,
      input.participantId,
      input.displayName,
      input.content,
      input.clientMessageId,
      replyToId,
      createdAt,
    );
    db.prepare('UPDATE participants SET last_seen_at = ? WHERE id = ?').run(createdAt, input.participantId);
    const stored = findById(db, input.roomId, messageId);
    if (!stored) throw new HttpError(500, 'Não foi possível enviar a mensagem.', 'send_failed');
    return mapMessage(stored);
  });

  try {
    return insert();
  } catch (error) {
    if (!isUniqueConstraint(error)) throw error;
    const existing = findByClientId(db, input.roomId, input.clientMessageId);
    if (existing && existing.participant_id === input.participantId) return mapMessage(existing);
    throw new HttpError(409, 'Identificador de envio já utilizado.', 'duplicate_client_id');
  }
}

export function listMessages(
  db: AppDatabase,
  roomId: string,
  options: { limit: number; before?: { createdAt: string; id: string } },
): MessagePage {
  const rows = options.before
    ? (db
        .prepare(
          `${MESSAGE_SELECT}
           WHERE m.room_id = ?
             AND (m.created_at < ? OR (m.created_at = ? AND m.id < ?))
           ORDER BY m.created_at DESC, m.id DESC
           LIMIT ?`,
        )
        .all(roomId, options.before.createdAt, options.before.createdAt, options.before.id, options.limit + 1) as MessageRow[])
    : (db
        .prepare(
          `${MESSAGE_SELECT}
           WHERE m.room_id = ?
           ORDER BY m.created_at DESC, m.id DESC
           LIMIT ?`,
        )
        .all(roomId, options.limit + 1) as MessageRow[]);

  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;
  return {
    messages: page.reverse().map(mapMessage),
    hasMore,
  };
}

function findByClientId(db: AppDatabase, roomId: string, clientMessageId: string): MessageRow | undefined {
  return db
    .prepare(`${MESSAGE_SELECT} WHERE m.room_id = ? AND m.client_message_id = ?`)
    .get(roomId, clientMessageId) as MessageRow | undefined;
}

function findById(db: AppDatabase, roomId: string, messageId: string): MessageRow | undefined {
  return db.prepare(`${MESSAGE_SELECT} WHERE m.room_id = ? AND m.id = ?`).get(roomId, messageId) as MessageRow | undefined;
}

function mapMessage(row: MessageRow): Message {
  const replyTo =
    row.reply_id && row.reply_participant_id && row.reply_display_name && row.reply_content
      ? {
          id: row.reply_id,
          participantId: row.reply_participant_id,
          displayName: row.reply_display_name,
          content: row.reply_content,
        }
      : null;
  return {
    id: row.id,
    roomId: row.room_id,
    participantId: row.participant_id,
    displayName: row.display_name,
    content: row.content,
    clientMessageId: row.client_message_id,
    createdAt: row.created_at,
    replyTo,
  };
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'SQLITE_CONSTRAINT_UNIQUE';
}
