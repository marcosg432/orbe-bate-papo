import { ArrowDown } from 'lucide-react';
import type { RefObject } from 'react';
import { formatDay } from '../services/messages';
import type { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';

type MessageListProps = {
  messages: ChatMessage[];
  participantId: string;
  hasMore: boolean;
  loadingOlder: boolean;
  showJump: boolean;
  listRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onLoadOlder: () => void;
  onJump: () => void;
  onRetry: (clientMessageId: string) => void;
};

export function MessageList({
  messages,
  participantId,
  hasMore,
  loadingOlder,
  showJump,
  listRef,
  onScroll,
  onLoadOlder,
  onJump,
  onRetry,
}: MessageListProps) {
  let previousDay = '';

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={listRef} onScroll={onScroll} className="h-full overflow-y-auto px-3 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {hasMore ? (
            <button
              type="button"
              onClick={onLoadOlder}
              disabled={loadingOlder}
              className="mx-auto rounded-full bg-sand px-4 py-2 text-xs font-semibold text-ink disabled:opacity-60"
            >
              {loadingOlder ? 'Carregando…' : 'Mensagens anteriores'}
            </button>
          ) : null}
          {messages.length === 0 ? (
            <div className="mx-auto mt-16 max-w-sm text-center">
              <p className="font-display text-3xl text-ink">A sala está em silêncio.</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">Envie a primeira mensagem. Ela fica guardada nesta conversa.</p>
            </div>
          ) : null}
          {messages.map((message) => {
            const day = formatDay(message.createdAt);
            const showDay = day !== previousDay;
            previousDay = day;
            return (
              <div key={message.clientMessageId} className="flex flex-col gap-3">
                {showDay ? <p className="mx-auto rounded-full bg-sand px-3 py-1 text-[11px] font-semibold tracking-wide text-muted">{day}</p> : null}
                <MessageBubble message={message} own={message.participantId === participantId} onRetry={onRetry} />
              </div>
            );
          })}
        </div>
      </div>
      {showJump ? (
        <button
          type="button"
          onClick={onJump}
          className="absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-ink px-3 py-2 text-xs font-semibold text-foam shadow-lg"
        >
          <ArrowDown size={14} />
          Novas mensagens
        </button>
      ) : null}
    </div>
  );
}
