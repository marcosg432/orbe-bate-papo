import type { AppDatabase } from '../database/db.js';
import { createOpaqueId } from '../utils/ids.js';

export type Room = {
  id: string;
  createdAt: string;
};

type RoomRow = {
  id: string;
  created_at: string;
};

export function createRoom(db: AppDatabase): Room {
  const room: Room = {
    id: createOpaqueId(),
    createdAt: new Date().toISOString(),
  };
  db.prepare('INSERT INTO rooms (id, created_at) VALUES (?, ?)').run(room.id, room.createdAt);
  return room;
}

export function findRoom(db: AppDatabase, roomId: string): Room | null {
  const row = db.prepare('SELECT id, created_at FROM rooms WHERE id = ?').get(roomId) as RoomRow | undefined;
  if (!row) return null;
  return { id: row.id, createdAt: row.created_at };
}
