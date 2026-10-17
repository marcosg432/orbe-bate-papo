export type OnlineParticipant = {
  id: string;
  displayName: string;
};

type Entry = OnlineParticipant & { sockets: number };

const rooms = new Map<string, Map<string, Entry>>();

export function presenceJoin(roomId: string, participantId: string, displayName: string): OnlineParticipant[] {
  let room = rooms.get(roomId);
  if (!room) {
    room = new Map();
    rooms.set(roomId, room);
  }
  const current = room.get(participantId);
  if (current) {
    current.sockets += 1;
    current.displayName = displayName;
  } else {
    room.set(participantId, { id: participantId, displayName, sockets: 1 });
  }
  return snapshot(room);
}

export function presenceLeave(roomId: string, participantId: string): OnlineParticipant[] {
  const room = rooms.get(roomId);
  if (!room) return [];
  const current = room.get(participantId);
  if (!current) return snapshot(room);
  current.sockets -= 1;
  if (current.sockets <= 0) room.delete(participantId);
  if (room.size === 0) {
    rooms.delete(roomId);
    return [];
  }
  return snapshot(room);
}

export function clearPresence(): void {
  rooms.clear();
}

function snapshot(room: Map<string, Entry>): OnlineParticipant[] {
  return [...room.values()]
    .map(({ id, displayName }) => ({ id, displayName }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR') || a.id.localeCompare(b.id));
}
