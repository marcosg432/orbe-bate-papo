import { Reply } from 'lucide-react';
import { colorFor, formatTime } from '../services/messages';
import type { ChatMessage, ReplyPreview } from '../types';
import { MediaMessage } from './MediaMessage';

type MessageBubbleProps = {
  message: ChatMessage;
  selfId: string;
  onReply: (message: ChatMessage) => void;
  onOpenOriginal: (messageId: string) => void;
  onRetry: (clientMessageId: string) => void;
};

export function MessageBubble({ message, selfId, onReply, onOpenOriginal, onRetry }: MessageBubbleProps) {
  const own = message.participantId === selfId;
  const author = own ? 'Você' : message.displayName;
  const canReply = message.status === 'sent';

  return (
    <article id={`msg-${message.id}`} className={`group flex scroll-mt-24 items-end gap-1 ${own ? 'justify-end' : 'justify-start'}`}>
      {own && canReply ? <ReplyButton label={author} onClick={() => onReply(message)} /> : null}
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
          {message.replyTo ? <QuotedMessage reply={message.replyTo} own={own} selfId={selfId} onOpen={() => onOpenOriginal(message.replyTo!.id)} /> : null}
          {message.attachment && message.kind !== 'text' ? <MediaMessage roomId={message.roomId} kind={message.kind} attachment={message.attachment} /> : <span>{message.content}</span>}
        </div>
        <p className="mt-1 px-1 text-[11px] text-muted">
          {author}
          {formatTime(message.createdAt) ? ` · ${formatTime(message.createdAt)}` : ''}
          {message.status === 'pending' ? ' · Enviando…' : ''}
          {message.status === 'failed' ? ' · Não enviada' : ''}
        </p>
        {message.status === 'failed' ? (
          <button type="button" onClick={() => onRetry(message.clientMessageId)} className="mt-1 px-1 text-xs font-semibold text-copper">
            Tentar de novo
          </button>
        ) : null}
      </div>
      {!own && canReply ? <ReplyButton label={author} onClick={() => onReply(message)} /> : null}
    </article>
  );
}

function QuotedMessage({ reply, own, selfId, onOpen }: { reply: ReplyPreview; own: boolean; selfId: string; onOpen: () => void }) {
  const label = reply.participantId === selfId ? 'Você' : reply.displayName;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={reply.content}
      className={`mb-2 block w-full rounded-xl border-l-2 px-2.5 py-1.5 text-left ${own ? 'border-foam/80 bg-white/10' : 'border-tide bg-sand'}`}
      style={own ? undefined : { borderColor: colorFor(reply.participantId) }}
    >
      <span className={`block text-xs font-semibold ${own ? 'text-foam' : ''}`} style={own ? undefined : { color: colorFor(reply.participantId) }}>
        {label}
      </span>
      <span className={`line-clamp-2 text-xs leading-snug [overflow-wrap:anywhere] ${own ? 'text-foam/80' : 'text-muted'}`}>{reply.content}</span>
    </button>
  );
}

function ReplyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Responder a ${label}`}
      onClick={onClick}
      className="mb-6 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-sand hover:text-ink"
    >
      <Reply size={16} />
    </button>
  );
}
