import fs from 'node:fs';
import { AUDIO_MAX_DURATION_MS } from '../constants.js';

export type MediaKind = 'image' | 'video' | 'audio' | 'document';

export type DetectedMedia = {
  mimeType: string;
  fileName: string;
};

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export function inspectMedia(filePath: string, kind: MediaKind, originalName: string): DetectedMedia | null {
  const prefix = readPrefix(filePath, kind === 'document' ? 20 * 1024 * 1024 : 64 * 1024);
  if (prefix.length === 0) return null;
  const mimeType = detectMime(kind, prefix, filePath);
  if (!mimeType) return null;
  return { mimeType, fileName: displayName(originalName, mimeType) };
}

export function readDurationMs(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  if (!/^\d+$/.test(value)) return null;
  const duration = Number(value);
  if (duration < 0 || duration > AUDIO_MAX_DURATION_MS) return null;
  return duration;
}

export function durationWasRejected(value: string | undefined): boolean {
  if (value === undefined || value === '') return false;
  return readDurationMs(value) === null;
}

function detectMime(kind: MediaKind, prefix: Buffer, filePath: string): string | null {
  if (kind === 'image') return detectImage(prefix);
  if (kind === 'video') return detectVideo(prefix);
  if (kind === 'audio') return detectAudio(prefix);
  return detectDocument(prefix, filePath);
}

function detectImage(prefix: Buffer): string | null {
  if (prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) return 'image/jpeg';
  if (prefix.length >= 8 && prefix.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (prefix.length >= 6 && (prefix.subarray(0, 6).toString('ascii') === 'GIF87a' || prefix.subarray(0, 6).toString('ascii') === 'GIF89a')) {
    return 'image/gif';
  }
  if (prefix.length >= 12 && prefix.subarray(0, 4).toString('ascii') === 'RIFF' && prefix.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

function detectVideo(prefix: Buffer): string | null {
  if (isIsoBmff(prefix)) return 'video/mp4';
  if (isWebm(prefix)) return 'video/webm';
  return null;
}

function detectAudio(prefix: Buffer): string | null {
  if (prefix.length >= 4 && prefix.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  if (isWebm(prefix)) return 'audio/webm';
  if (isIsoBmff(prefix)) return 'audio/mp4';
  return null;
}

function detectDocument(prefix: Buffer, filePath: string): string | null {
  if (prefix.length >= 5 && prefix.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (prefix.length >= 4 && prefix[0] === 0x50 && prefix[1] === 0x4b && prefix[2] === 0x03 && prefix[3] === 0x04) {
    const stored = fs.readFileSync(filePath);
    if (stored.includes(Buffer.from('word/document.xml'))) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    return null;
  }
  if (!isPlainText(prefix.length === fs.statSync(filePath).size ? prefix : fs.readFileSync(filePath))) return null;
  return 'text/plain';
}

function isPlainText(bytes: Buffer): boolean {
  if (bytes.length === 0 || bytes.includes(0)) return false;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const sample = text.trim().slice(0, 64).toLowerCase();
    if (sample.startsWith('<!doctype html') || sample.startsWith('<html') || sample.startsWith('<script')) return false;
    return true;
  } catch {
    return false;
  }
}

function isIsoBmff(prefix: Buffer): boolean {
  return prefix.length >= 12 && prefix.subarray(4, 8).toString('ascii') === 'ftyp';
}

function isWebm(prefix: Buffer): boolean {
  if (prefix.length < 4 || prefix[0] !== 0x1a || prefix[1] !== 0x45 || prefix[2] !== 0xdf || prefix[3] !== 0xa3) return false;
  return prefix.includes(Buffer.from('webm'));
}

function displayName(originalName: string, mimeType: string): string {
  const extension = MIME_EXTENSION[mimeType] ?? 'bin';
  const base = originalName.replace(/\.[A-Za-z0-9]{1,8}$/, '').slice(0, 80);
  const stem = base.length > 0 ? base : 'arquivo';
  return `${stem}.${extension}`;
}

function readPrefix(filePath: string, maxBytes: number): Buffer {
  const stats = fs.statSync(filePath);
  const length = Math.min(stats.size, maxBytes);
  const handle = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    fs.readSync(handle, buffer, 0, length, 0);
    return buffer;
  } finally {
    fs.closeSync(handle);
  }
}
