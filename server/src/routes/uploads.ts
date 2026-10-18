import type { Router } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import { AUDIO_MAX_DURATION_MS } from '../constants.js';
import type { AppDatabase } from '../database/db.js';
import { requireSession } from '../middleware/requireSession.js';
import { appendMediaMessage, findAttachment, type MediaKind } from '../services/messages.js';
import { receiveUpload } from '../services/incomingUpload.js';
import { storageKey, type ObjectStore } from '../services/objectStore.js';
import { publishMessage } from '../services/realtime.js';
import { consumeRateLimit } from '../services/rateLimit.js';
import { contentDisposition, sanitizeFileName } from '../utils/fileNames.js';
import { HttpError, readParam } from '../utils/http.js';
import { isOpaqueId } from '../utils/ids.js';
import { logger } from '../utils/logger.js';
import { durationWasRejected, inspectMedia, readDurationMs } from '../utils/mediaSniff.js';
import { parseWith } from '../utils/validation.js';

const uploadFieldsSchema = z.object({
  clientMessageId: z.uuid('Identificador de envio inválido.'),
  kind: z.enum(['image', 'video', 'audio', 'document'], 'Tipo de arquivo inválido.'),
  replyToId: z.uuid('A mensagem respondida é inválida.').optional(),
  durationMs: z.string().optional(),
});

const KIND_LABEL: Record<MediaKind, string> = {
  image: 'imagem',
  video: 'vídeo',
  audio: 'áudio',
  document: 'documento',
};

export function registerUploads(router: Router, db: AppDatabase, config: AppConfig, store: ObjectStore): void {
  const authorize = requireSession(db, config);

  router.post('/:roomId/uploads', authorize, async (req, res, next) => {
    let keptFile: { roomId: string; fileId: string } | null = null;
    try {
      const auth = req.auth;
      if (!auth) throw new HttpError(401, 'Entre com um nome para acessar esta conversa.', 'unauthorized');
      assertUploadRate(config, auth.participantId, auth.roomId);
      const maxBytes = Math.max(config.mediaLimits.image, config.mediaLimits.video, config.mediaLimits.audio, config.mediaLimits.document);
      const received = await receiveUpload(req, store, auth.roomId, maxBytes);
      if (received.aborted) return;
      if (received.file) keptFile = { roomId: auth.roomId, fileId: received.file.id };
      if (received.tooLarge) throw new HttpError(413, 'O arquivo é grande demais.', 'file_too_large');
      if (!received.file) throw new HttpError(400, 'Escolha um arquivo para enviar.', 'invalid_input');

      const fields = parseWith(uploadFieldsSchema, cleanFields(received.fields));
      const limit = config.mediaLimits[fields.kind];
      if (received.file.size > limit) {
        throw new HttpError(413, `O ${KIND_LABEL[fields.kind]} pode ter no máximo ${formatLimit(limit)}.`, 'file_too_large');
      }
      if (fields.kind === 'audio' && durationWasRejected(fields.durationMs)) {
        throw new HttpError(400, `O áudio pode ter no máximo ${AUDIO_MAX_DURATION_MS / 60000} minutos.`, 'audio_too_long');
      }

      const filePath = store.location(auth.roomId, received.file.id);
      const detected = inspectMedia(filePath, fields.kind, sanitizeFileName(received.file.originalName));
      if (!detected) throw new HttpError(400, 'Este arquivo não é um formato permitido.', 'invalid_media');

      const message = appendMediaMessage(db, {
        roomId: auth.roomId,
        participantId: auth.participantId,
        displayName: auth.displayName,
        content: mediaContent(fields.kind, detected.fileName),
        clientMessageId: fields.clientMessageId,
        replyToId: fields.replyToId,
        kind: fields.kind,
        attachment: {
          id: received.file.id,
          mimeType: detected.mimeType,
          fileName: detected.fileName,
          sizeBytes: received.file.size,
          durationMs: fields.kind === 'audio' ? readDurationMs(fields.durationMs) : null,
          storageKey: storageKey(auth.roomId, received.file.id),
        },
      });

      if (message.attachment?.id !== received.file.id) {
        store.remove(auth.roomId, received.file.id);
      } else {
        publishMessage(auth.roomId, message);
        logger.info('upload stored', { mediaType: fields.kind, size: received.file.size });
      }
      keptFile = null;
      res.status(201).json({ message });
    } catch (error) {
      if (keptFile) store.remove(keptFile.roomId, keptFile.fileId);
      if (res.headersSent || req.aborted) return;
      next(error);
    }
  });

  router.get('/:roomId/attachments/:attachmentId', authorize, (req, res, next) => {
    try {
      const auth = req.auth;
      if (!auth) throw new HttpError(401, 'Entre com um nome para acessar esta conversa.', 'unauthorized');
      const attachmentId = readParam(req.params.attachmentId);
      if (!isOpaqueId(attachmentId)) throw new HttpError(404, 'Arquivo não encontrado.', 'not_found');
      const attachment = findAttachment(db, auth.roomId, attachmentId);
      if (!attachment || attachment.storageKey !== storageKey(auth.roomId, attachment.id)) {
        throw new HttpError(404, 'Arquivo não encontrado.', 'not_found');
      }
      const opened = store.open(auth.roomId, attachment.id);
      if (!opened) throw new HttpError(404, 'Arquivo não encontrado.', 'not_found');
      const download = req.query.download === '1' || attachment.mediaType === 'document';
      const mimeType = attachment.mimeType === 'text/plain' ? 'text/plain; charset=utf-8' : attachment.mimeType;
      res.status(200);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', String(opened.size));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', contentDisposition(download ? 'attachment' : 'inline', attachment.fileName));
      res.setHeader('Cache-Control', 'private, no-store');
      opened.stream.on('error', () => {
        if (!res.headersSent) res.status(404).end();
        else res.destroy();
      });
      opened.stream.pipe(res);
    } catch (error) {
      next(error);
    }
  });
}

function assertUploadRate(config: AppConfig, participantId: string, roomId: string): void {
  if (!config.rateLimitEnabled) return;
  const participantOk = consumeRateLimit(
    `upload:participant:${participantId}`,
    config.rateLimits.uploadParticipant.limit,
    config.rateLimits.uploadParticipant.windowMs,
  );
  const roomOk = consumeRateLimit(`upload:room:${roomId}`, config.rateLimits.uploadRoom.limit, config.rateLimits.uploadRoom.windowMs);
  if (!participantOk || !roomOk) {
    throw new HttpError(429, 'Muitos arquivos em pouco tempo. Aguarde um instante.', 'rate_limited');
  }
}

function cleanFields(fields: Record<string, string>): Record<string, string | undefined> {
  return {
    clientMessageId: fields.clientMessageId,
    kind: fields.kind,
    replyToId: fields.replyToId || undefined,
    durationMs: fields.durationMs,
  };
}

function mediaContent(kind: MediaKind, fileName: string): string {
  if (kind === 'image') return 'Foto';
  if (kind === 'video') return 'Vídeo';
  if (kind === 'audio') return 'Áudio';
  return fileName.slice(0, 2000);
}

function formatLimit(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  const label = Number.isInteger(megabytes) ? String(megabytes) : megabytes.toFixed(1);
  return `${label} MB`;
}
