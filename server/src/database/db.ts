import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 40),
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  device_hash TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (device_hash, room_id),
  FOREIGN KEY (participant_id) REFERENCES participants(id),
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 40),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  client_message_id TEXT NOT NULL,
  reply_to_id TEXT,
  kind TEXT NOT NULL DEFAULT 'text',
  created_at TEXT NOT NULL,
  UNIQUE (room_id, client_message_id),
  FOREIGN KEY (room_id) REFERENCES rooms(id),
  FOREIGN KEY (participant_id) REFERENCES participants(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_room_time
  ON messages (room_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_sessions_device
  ON sessions (device_hash, room_id);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  participant_id TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'audio', 'document')),
  mime_type TEXT NOT NULL,
  original_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  duration_ms INTEGER,
  storage_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id),
  FOREIGN KEY (message_id) REFERENCES messages(id),
  FOREIGN KEY (participant_id) REFERENCES participants(id)
);
`;

export type AppDatabase = Database.Database;

export function openDatabase(databasePath: string): AppDatabase {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  if (databasePath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

function migrate(db: AppDatabase): void {
  const columns = db.prepare('PRAGMA table_info(messages)').all() as { name: string }[];
  if (!columns.some((column) => column.name === 'reply_to_id')) {
    db.exec('ALTER TABLE messages ADD COLUMN reply_to_id TEXT');
  }
  if (!columns.some((column) => column.name === 'kind')) {
    db.exec("ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'text'");
  }
}
