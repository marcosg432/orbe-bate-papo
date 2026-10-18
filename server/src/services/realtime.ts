import type { Message } from './messages.js';

type MessageSink = (roomId: string, message: Message) => void;

let sink: MessageSink | null = null;

export function bindMessageSink(next: MessageSink | null): void {
  sink = next;
}

export function publishMessage(roomId: string, message: Message): void {
  sink?.(roomId, message);
}
