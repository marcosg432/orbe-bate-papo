import type { Message } from '../services/messages.js';
import type { OnlineParticipant } from '../services/presence.js';

export type SendMessagePayload = {
  clientMessageId: string;
  content: string;
};

export type SendAck =
  | { ok: true; message: Message }
  | { ok: false; error: string; code: string };

export interface ClientToServerEvents {
  'message:send': (payload: SendMessagePayload, ack: (response: SendAck) => void) => void;
}

export interface ServerToClientEvents {
  'message:new': (message: Message) => void;
  'presence:update': (payload: { participants: OnlineParticipant[] }) => void;
  'session:expired': () => void;
}

export type SocketData = {
  sessionId: string;
  roomId: string;
  participantId: string;
  displayName: string;
};
