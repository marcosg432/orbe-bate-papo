import type { ChatMessage, Message } from '../types';

const palette = ['#c56a32', '#1f6f66', '#3d5a80', '#8d4a6b', '#6b5b3a', '#2f5d50'];

export function colorFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length] ?? palette[0];
}

export function compareMessages(a: Message, b: Message): number {
  if (a.createdAt < b.createdAt) return -1;
  if (a.createdAt > b.createdAt) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

export function mergeLatest(current: ChatMessage[], latest: Message[]): ChatMessage[] {
  const latestIds = new Set(latest.map((item) => item.id));
  const latestClientIds = new Set(latest.map((item) => item.clientMessageId));
  const older = current.filter((item) => item.status === 'sent' && !latestIds.has(item.id));
  const local = current.filter(
    (item) => (item.status === 'pending' || item.status === 'failed') && !latestClientIds.has(item.clientMessageId),
  );
  return [...older, ...latest.map((item) => ({ ...item, status: 'sent' as const })), ...local].sort(compareMessages);
}

export function upsertMessage(current: ChatMessage[], message: Message): ChatMessage[] {
  const next = current.slice();
  const index = next.findIndex((item) => item.id === message.id || item.clientMessageId === message.clientMessageId);
  const confirmed: ChatMessage = { ...message, status: 'sent' };
  if (index === -1) next.push(confirmed);
  else next[index] = confirmed;
  return next.sort(compareMessages);
}

export function roomUrl(roomId: string): string {
  return `${window.location.origin}/room/${roomId}`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = start(today) - start(date);
  if (diff === 0) return 'Hoje';
  if (diff === 86_400_000) return 'Ontem';
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(date);
}

export function formatOpened(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Conversa privada';
  const label = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(date);
  return `Aberta em ${label}`;
}

export function onlineLabel(count: number): string {
  if (count <= 0) return 'Entrando…';
  if (count === 1) return '1 online';
  return `${count} online`;
}
