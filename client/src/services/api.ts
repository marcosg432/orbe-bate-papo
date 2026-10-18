import type { Attachment, Message, MessagePage, ReplyPreview, Room, RoomSession } from '../types';

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createRoom(): Promise<{ room: Room }> {
  return request('/api/rooms', { method: 'POST' });
}

export function getRoom(roomId: string): Promise<RoomSession> {
  return request(`/api/rooms/${roomId}`);
}

export function createSession(roomId: string, displayName: string): Promise<RoomSession> {
  return request(`/api/rooms/${roomId}/sessions`, {
    method: 'POST',
    body: JSON.stringify({ displayName }),
  });
}

export function getMessages(
  roomId: string,
  query: { limit?: number; beforeCreatedAt?: string; beforeId?: string } = {},
): Promise<MessagePage> {
  const params = new URLSearchParams();
  if (query.limit) params.set('limit', String(query.limit));
  if (query.beforeCreatedAt && query.beforeId) {
    params.set('beforeCreatedAt', query.beforeCreatedAt);
    params.set('beforeId', query.beforeId);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return request(`/api/rooms/${roomId}/messages${suffix}`);
}

export function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.roomId === 'string' &&
    typeof item.participantId === 'string' &&
    typeof item.displayName === 'string' &&
    typeof item.content === 'string' &&
    typeof item.createdAt === 'string' &&
    typeof item.clientMessageId === 'string' &&
    (item.kind == null || isKind(item.kind)) &&
    (item.attachment == null || isAttachment(item.attachment)) &&
    (item.replyTo == null || isReplyPreview(item.replyTo))
  );
}

function isKind(value: unknown): value is Message['kind'] {
  return value === 'text' || value === 'image' || value === 'video' || value === 'audio' || value === 'document';
}

function isAttachment(value: unknown): value is Attachment {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    (item.mediaType === 'image' || item.mediaType === 'video' || item.mediaType === 'audio' || item.mediaType === 'document') &&
    typeof item.mimeType === 'string' &&
    typeof item.fileName === 'string' &&
    typeof item.sizeBytes === 'number'
  );
}

function isReplyPreview(value: unknown): value is ReplyPreview {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.participantId === 'string' &&
    typeof item.displayName === 'string' &&
    typeof item.content === 'string'
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      signal: AbortSignal.timeout(15000),
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor.', 0, 'network');
  }

  if (!response.ok) {
    let message = 'Algo deu errado.';
    let code: string | undefined;
    try {
      const body = (await response.json()) as { error?: unknown; code?: unknown };
      if (typeof body.error === 'string' && body.error.trim()) message = body.error;
      if (typeof body.code === 'string') code = body.code;
    } catch {
      message = response.statusText || message;
    }
    throw new ApiError(message, response.status, code);
  }

  return (await response.json()) as T;
}
