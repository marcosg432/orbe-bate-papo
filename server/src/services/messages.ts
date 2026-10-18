import { randomUUID } from 'node:crypto';
import type { AppDatabase } from '../database/db.js';
import { HttpError } from '../utils/http.js';

export type ReplyPreview = {
  id: string;
  participantId: string;
  displayName: string;
  content: string;
};

export type MediaKind = 'image' | 'video' | 'audio' | 'document';
export type MessageKind = 'text' | MediaKind;

export type Attachment = {
  id: string;
  mediaType: MediaKind;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
  durationMs: number | null;
};

export type Message = {
  id: string;
  roomId: string;
  participantId: string;
  displayName: string;
  content: string;
  clientMessageId: string;
  createdAt: string;
  kind: MessageKind;
  attachment: Attachment | null;
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
  kind: string;
  attachment_id: string | null;
  attachment_media_type: string | null;
  attachment_mime_type: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  attachment_duration: number | null;
};

const MESSAGE_SELECT = `
  SELECT
    m.id, m.room_id, m.participant_id, m.display_name, m.content, m.client_message_id, m.created_at, m.kind,
    parent.id AS reply_id,
    parent.participant_id AS reply_participant_id,
    parent.display_name AS reply_display_name,
    parent.content AS reply_content,
    attachment.id AS attachment_id,
    attachment.media_type AS attachment_media_type,
    attachment.mime_type AS attachment_mime_type,
    attachment.original_name AS attachment_name,
    attachment.size_bytes AS attachment_size,
    attachment.duration_ms AS attachment_duration
  FROM messages AS m
  LEFT JOIN messages AS parent ON parent.id = m.reply_to_id AND parent.room_id = m.room_id
  LEFT JOIN attachments AS attachment ON attachment.message_id = m.id
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
        id, room_id, participant_id, display_name, content, client_message_id, reply_to_id, kind, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'text', ?)`,
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

export function appendMediaMessage(
  db: AppDatabase,
  input: {
    roomId: string;
    participantId: string;
    displayName: string;
    content: string;
    clientMessageId: string;
    replyToId?: string;
    kind: MediaKind;
    attachment: {
      id: string;
      mimeType: string;
      fileName: string;
      sizeBytes: number;
      durationMs: number | null;
      storageKey: string;
    };
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
        id, room_id, participant_id, display_name, content, client_message_id, reply_to_id, kind, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      messageId,
      input.roomId,
      input.participantId,
      input.displayName,
      input.content,
      input.clientMessageId,
      replyToId,
      input.kind,
      createdAt,
    );
    db.prepare(
      `INSERT INTO attachments (
        id, room_id, message_id, participant_id, media_type, mime_type, original_name, size_bytes, duration_ms, storage_key, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      input.attachment.id,
      input.roomId,
      messageId,
      input.participantId,
      input.kind,
      input.attachment.mimeType,
      input.attachment.fileName,
      input.attachment.sizeBytes,
      input.attachment.durationMs,
      input.attachment.storageKey,
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

export function findAttachment(
  db: AppDatabase,
  roomId: string,
  attachmentId: string,
): { id: string; mimeType: string; fileName: string; mediaType: MediaKind; storageKey: string } | undefined {
  const row = db
    .prepare(
      `SELECT id, mime_type, original_name, media_type, storage_key
       FROM attachments
       WHERE room_id = ? AND id = ?`,
    )
    .get(roomId, attachmentId) as
    | { id: string; mime_type: string; original_name: string; media_type: MediaKind; storage_key: string }
    | undefined;
  if (!row) return undefined;
  if (row.storage_key !== `${roomId}/${row.id}`) return undefined;
  return {
    id: row.id,
    mimeType: row.mime_type,
    fileName: row.original_name,
    mediaType: row.media_type,
    storageKey: row.storage_key,
  };
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
    kind: isMessageKind(row.kind) ? row.kind : 'text',
    attachment: mapAttachment(row),
    replyTo,
  };
}

function mapAttachment(row: MessageRow): Attachment | null {
  if (!row.attachment_id || !row.attachment_media_type || !row.attachment_mime_type || !row.attachment_name || !row.attachment_size) {
    return null;
  }
  if (!isMediaKind(row.attachment_media_type)) return null;
  return {
    id: row.attachment_id,
    mediaType: row.attachment_media_type,
    mimeType: row.attachment_mime_type,
    fileName: row.attachment_name,
    sizeBytes: row.attachment_size,
    durationMs: row.attachment_duration,
  };
}

function isMediaKind(value: string): value is MediaKind {
  return value === 'image' || value === 'video' || value === 'audio' || value === 'document';
}

function isMessageKind(value: string): value is MessageKind {
  return value === 'text' || isMediaKind(value);
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'SQLITE_CONSTRAINT_UNIQUE';
}
