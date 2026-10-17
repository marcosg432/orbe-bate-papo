import { randomUUID } from 'node:crypto';
import type { AppDatabase } from '../database/db.js';
import { HttpError } from '../utils/http.js';

export type Message = {
  id: string;
  roomId: string;
  participantId: string;
  displayName: string;
  content: string;
  clientMessageId: string;
  createdAt: string;
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
};

export function appendMessage(
  db: AppDatabase,
  input: {
    roomId: string;
    participantId: string;
    displayName: string;
    content: string;
    clientMessageId: string;
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

    const message: Message = {
      id: randomUUID(),
      roomId: input.roomId,
      participantId: input.participantId,
      displayName: input.displayName,
      content: input.content,
      clientMessageId: input.clientMessageId,
      createdAt: new Date().toISOString(),
    };

    db.prepare(
      `INSERT INTO messages (
        id, room_id, participant_id, display_name, content, client_message_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      message.id,
      message.roomId,
      message.participantId,
      message.displayName,
      message.content,
      message.clientMessageId,
      message.createdAt,
    );
    db.prepare('UPDATE participants SET last_seen_at = ? WHERE id = ?').run(message.createdAt, input.participantId);
    return message;
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
          `SELECT id, room_id, participant_id, display_name, content, client_message_id, created_at
           FROM messages
           WHERE room_id = ?
             AND (created_at < ? OR (created_at = ? AND id < ?))
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
        .all(roomId, options.before.createdAt, options.before.createdAt, options.before.id, options.limit + 1) as MessageRow[])
    : (db
        .prepare(
          `SELECT id, room_id, participant_id, display_name, content, client_message_id, created_at
           FROM messages
           WHERE room_id = ?
           ORDER BY created_at DESC, id DESC
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
    .prepare(
      `SELECT id, room_id, participant_id, display_name, content, client_message_id, created_at
       FROM messages
       WHERE room_id = ? AND client_message_id = ?`,
    )
    .get(roomId, clientMessageId) as MessageRow | undefined;
}

function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    roomId: row.room_id,
    participantId: row.participant_id,
    displayName: row.display_name,
    content: row.content,
    clientMessageId: row.client_message_id,
    createdAt: row.created_at,
  };
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'SQLITE_CONSTRAINT_UNIQUE';
}
