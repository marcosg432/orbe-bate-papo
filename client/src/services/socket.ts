import { io, type Socket } from 'socket.io-client';
import type { Message, OnlineParticipant, SendAck } from '../types';

type ServerEvents = {
  'message:new': (message: Message) => void;
  'presence:update': (payload: { participants: OnlineParticipant[] }) => void;
  'session:expired': () => void;
};

type ClientEvents = {
  'message:send': (
    payload: { clientMessageId: string; content: string; replyToId?: string },
    ack: (response: SendAck) => void,
  ) => void;
};

export type ChatSocket = Socket<ServerEvents, ClientEvents>;

export function createChatSocket(roomId: string): ChatSocket {
  const explicit = import.meta.env.VITE_SOCKET_URL?.trim();
  const options = {
    withCredentials: true,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    auth: { roomId },
  };
  return explicit ? io(explicit, options) : io(options);
}

export function isSendAck(value: unknown): value is SendAck {
  if (!value || typeof value !== 'object') return false;
  const item = value as { ok?: unknown; message?: unknown; error?: unknown; code?: unknown };
  if (item.ok === true) return typeof item.message === 'object' && item.message !== null;
  return item.ok === false && typeof item.error === 'string' && typeof item.code === 'string';
}
