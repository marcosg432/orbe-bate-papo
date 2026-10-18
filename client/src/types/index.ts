export type Room = {
  id: string;
  createdAt: string;
};

export type Participant = {
  id: string;
  displayName: string;
};

export type RoomSession = {
  room: Room;
  participant: Participant;
  expiresAt: string;
};

export type ReplyPreview = {
  id: string;
  participantId: string;
  displayName: string;
  content: string;
};

export type MediaKind = 'image' | 'video' | 'audio' | 'document';

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
  kind: 'text' | MediaKind;
  attachment: Attachment | null;
  replyTo: ReplyPreview | null;
};

export type DeliveryStatus = 'pending' | 'sent' | 'failed';

export type ChatMessage = Message & {
  status: DeliveryStatus;
};

export type OnlineParticipant = {
  id: string;
  displayName: string;
};

export type MessagePage = {
  messages: Message[];
  hasMore: boolean;
};

export type SendAck =
  | { ok: true; message: Message }
  | { ok: false; error: string; code: string };

export type ConnectionState = 'connecting' | 'online' | 'reconnecting';

export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isRoomId(value: string | undefined): value is string {
  return typeof value === 'string' && ROOM_ID_PATTERN.test(value);
}
