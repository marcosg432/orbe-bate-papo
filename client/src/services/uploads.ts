import { ApiError, isMessage } from './api';
import type { MediaKind, Message } from '../types';

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const MEDIA_LIMITS: Record<MediaKind, number> = {
  image: 10 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  document: 20 * 1024 * 1024,
  audio: 12 * 1024 * 1024,
};

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  const megabytes = size / (1024 * 1024);
  return `${megabytes >= 10 ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
}

export function formatDuration(durationMs: number): string {
  const total = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function attachmentUrl(roomId: string, attachmentId: string, download = false): string {
  const base = `${API_URL}/api/rooms/${roomId}/attachments/${attachmentId}`;
  return download ? `${base}?download=1` : base;
}

export function fileTooLargeMessage(kind: MediaKind): string {
  const labels: Record<MediaKind, string> = {
    image: 'A imagem pode ter no máximo 10 MB.',
    video: 'O vídeo pode ter no máximo 100 MB.',
    document: 'O documento pode ter no máximo 20 MB.',
    audio: 'O áudio ficou grande demais para enviar.',
  };
  return labels[kind];
}

export function uploadAttachment(
  roomId: string,
  input: {
    file: Blob;
    fileName: string;
    kind: MediaKind;
    clientMessageId: string;
    replyToId?: string;
    durationMs?: number;
  },
  onProgress: (ratio: number) => void,
  signal: AbortSignal,
): Promise<Message> {
  if (input.file.size > MEDIA_LIMITS[input.kind]) {
    return Promise.reject(new ApiError(fileTooLargeMessage(input.kind), 413, 'file_too_large'));
  }
  const body = new FormData();
  body.set('clientMessageId', input.clientMessageId);
  body.set('kind', input.kind);
  if (input.replyToId) body.set('replyToId', input.replyToId);
  if (input.durationMs !== undefined) body.set('durationMs', String(input.durationMs));
  body.set('file', input.file, input.fileName);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/rooms/${roomId}/uploads`);
    xhr.withCredentials = true;
    xhr.timeout = 5 * 60 * 1000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    const fail = () => {
      if (signal.aborted) {
        reject(new ApiError('Envio cancelado.', 0, 'aborted'));
        return;
      }
      let message = 'Não foi possível enviar o arquivo.';
      let code: string | undefined;
      try {
        const parsed = JSON.parse(xhr.responseText) as { error?: unknown; code?: unknown };
        if (typeof parsed.error === 'string' && parsed.error.trim()) message = parsed.error;
        if (typeof parsed.code === 'string') code = parsed.code;
      } catch {
        message = xhr.status ? 'Não foi possível enviar o arquivo.' : 'Não foi possível conectar ao servidor.';
      }
      reject(new ApiError(message, xhr.status, code));
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        fail();
        return;
      }
      try {
        const parsed = JSON.parse(xhr.responseText) as { message?: unknown };
        if (!isMessage(parsed.message)) {
          reject(new ApiError('O servidor não confirmou o arquivo.', xhr.status, 'invalid_response'));
          return;
        }
        resolve({
          ...parsed.message,
          kind: parsed.message.kind ?? input.kind,
          attachment: parsed.message.attachment ?? null,
          replyTo: parsed.message.replyTo ?? null,
        });
      } catch {
        reject(new ApiError('O servidor não confirmou o arquivo.', xhr.status, 'invalid_response'));
      }
    };
    xhr.onerror = fail;
    xhr.ontimeout = fail;
    xhr.onabort = () => reject(new ApiError('Envio cancelado.', 0, 'aborted'));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}
