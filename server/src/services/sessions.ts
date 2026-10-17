import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config.js';
import type { AppDatabase } from '../database/db.js';
import { HttpError } from '../utils/http.js';
import { hashSecret } from '../utils/ids.js';
import { findRoom } from './rooms.js';

export type Participant = {
  id: string;
  displayName: string;
};

export type AuthContext = {
  sessionId: string;
  roomId: string;
  participantId: string;
  displayName: string;
  expiresAt: string;
  refreshed: boolean;
};

type SessionRow = {
  id: string;
  device_hash: string;
  participant_id: string;
  room_id: string;
  expires_at: string;
  display_name: string;
};

export type JoinResult = {
  created: boolean;
  room: { id: string; createdAt: string };
  participant: Participant;
  expiresAt: string;
};

export function resolveSession(
  db: AppDatabase,
  config: AppConfig,
  token: string,
  roomId: string,
): AuthContext | null {
  const row = findSessionRow(db, hashSecret(token), roomId);
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) return null;

  let expiresAt = row.expires_at;
  let refreshed = false;
  const remaining = Date.parse(row.expires_at) - Date.now();
  if (remaining < config.sessionTtlMs / 2) {
    expiresAt = new Date(Date.now() + config.sessionTtlMs).toISOString();
    db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(expiresAt, row.id);
    refreshed = true;
  }
  db.prepare('UPDATE participants SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), row.participant_id);

  return {
    sessionId: row.id,
    roomId: row.room_id,
    participantId: row.participant_id,
    displayName: row.display_name,
    expiresAt,
    refreshed,
  };
}

export function getSessionById(db: AppDatabase, sessionId: string): AuthContext | null {
  const row = db
    .prepare(
      `SELECT sessions.id, sessions.device_hash, sessions.participant_id, sessions.room_id,
              sessions.expires_at, participants.display_name
       FROM sessions
       JOIN participants ON participants.id = sessions.participant_id
       WHERE sessions.id = ?`,
    )
    .get(sessionId) as SessionRow | undefined;
  if (!row || Date.parse(row.expires_at) <= Date.now()) return null;
  return {
    sessionId: row.id,
    roomId: row.room_id,
    participantId: row.participant_id,
    displayName: row.display_name,
    expiresAt: row.expires_at,
    refreshed: false,
  };
}

export function joinRoom(
  db: AppDatabase,
  config: AppConfig,
  input: { token: string; roomId: string; displayName: string },
): JoinResult {
  const room = findRoom(db, input.roomId);
  if (!room) {
    throw new HttpError(404, 'Conversa não encontrada.', 'room_not_found');
  }
  const deviceHash = hashSecret(input.token);
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + config.sessionTtlMs).toISOString();

  const run = db.transaction((): JoinResult => {
    const existing = findSessionRow(db, deviceHash, input.roomId);
    if (existing && Date.parse(existing.expires_at) > Date.now()) {
      db.prepare('UPDATE participants SET last_seen_at = ? WHERE id = ?').run(now, existing.participant_id);
      return {
        created: false,
        room,
        participant: { id: existing.participant_id, displayName: existing.display_name },
        expiresAt: existing.expires_at,
      };
    }

    if (existing) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(existing.id);
    }

    const participantId = randomUUID();
    const sessionId = randomUUID();
    db.prepare(
      `INSERT INTO participants (id, room_id, display_name, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(participantId, input.roomId, input.displayName, now, now);
    db.prepare(
      `INSERT INTO sessions (id, device_hash, participant_id, room_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(sessionId, deviceHash, participantId, input.roomId, expiresAt, now);

    return {
      created: true,
      room,
      participant: { id: participantId, displayName: input.displayName },
      expiresAt,
    };
  });

  return run();
}

function findSessionRow(db: AppDatabase, deviceHash: string, roomId: string): SessionRow | undefined {
  return db
    .prepare(
      `SELECT sessions.id, sessions.device_hash, sessions.participant_id, sessions.room_id,
              sessions.expires_at, participants.display_name
       FROM sessions
       JOIN participants ON participants.id = sessions.participant_id
       WHERE sessions.device_hash = ? AND sessions.room_id = ?`,
    )
    .get(deviceHash, roomId) as SessionRow | undefined;
}
