import { colorFor, formatTime } from '../services/messages';
import type { ChatMessage } from '../types';

type MessageBubbleProps = {
  message: ChatMessage;
  own: boolean;
  onRetry: (clientMessageId: string) => void;
};

export function MessageBubble({ message, own, onRetry }: MessageBubbleProps) {
  return (
    <article className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] sm:max-w-[70%] ${own ? 'items-end' : 'items-start'} flex flex-col`}>
        {own ? null : (
          <p className="mb-1 px-1 text-xs font-semibold" style={{ color: colorFor(message.participantId) }}>
            {message.displayName}
          </p>
        )}
        <div
          className={`rounded-[1.35rem] px-4 py-2.5 text-[15px] leading-relaxed shadow-sm [overflow-wrap:anywhere] whitespace-pre-wrap ${
            own ? 'rounded-br-md bg-own text-foam' : 'rounded-bl-md border border-line bg-white text-ink'
          }`}
        >
          {message.content}
        </div>
        <p className="mt-1 px-1 text-[11px] text-muted">
          {own ? 'Você' : message.displayName}
          {formatTime(message.createdAt) ? ` · ${formatTime(message.createdAt)}` : ''}
          {message.status === 'pending' ? ' · Enviando…' : ''}
          {message.status === 'failed' ? ' · Não enviada' : ''}
        </p>
        {message.status === 'failed' ? (
          <button
            type="button"
            onClick={() => onRetry(message.clientMessageId)}
            className="mt-1 px-1 text-xs font-semibold text-copper"
          >
            Tentar de novo
          </button>
        ) : null}
      </div>
    </article>
  );
}
