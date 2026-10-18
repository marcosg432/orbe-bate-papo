import { useState } from 'react';
import { LoaderCircle, Users } from 'lucide-react';
import { useChatContext } from '../contexts/ChatContext';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { formatOpened, onlineLabel } from '../services/messages';
import { uploadAttachment } from '../services/uploads';
import { createMessageId } from '../services/ids';
import { Brand } from './BrandMark';
import { Button } from './Button';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { PresenceList } from './PresenceList';
import { ShareButton } from './ShareButton';
import type { ReplyPreview } from '../types';

export function ChatScreen({ roomId, selfId, displayName, createdAt }: { roomId: string; selfId: string; displayName: string; createdAt: string }) {
  const chat = useChatContext();
  const tailKey = chat.messages.at(-1)?.clientMessageId ?? '';
  const scroll = useAutoScroll(tailKey, !chat.loading && !chat.loadError);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null);
  const status = chat.connection === 'reconnecting' ? 'Reconectando…' : onlineLabel(chat.presence.length);

  async function loadOlder() {
    const element = scroll.ref.current;
    const beforeHeight = element?.scrollHeight ?? 0;
    const beforeTop = element?.scrollTop ?? 0;
    await chat.loadOlder();
    requestAnimationFrame(() => {
      const node = scroll.ref.current;
      if (!node) return;
      node.scrollTop = beforeTop + (node.scrollHeight - beforeHeight);
    });
  }

  return (
    <div className="flex h-dvh min-h-0 bg-paper">
      <aside className="hidden w-80 shrink-0 flex-col bg-pine-deep text-foam md:flex">
        <div className="px-6 pt-6">
          <Brand light />
          <p className="mt-8 font-display text-3xl leading-tight">Conversa privada</p>
          <p className="mt-2 text-sm text-foam/70">{formatOpened(createdAt)}</p>
        </div>
        <div className="px-6 py-5">
          <ShareButton roomId={roomId} light />
          <p className="mt-6 text-xs font-semibold tracking-[0.14em] text-foam/60 uppercase">Você aparece como</p>
          <p className="mt-1 text-base font-semibold">{displayName}</p>
          <p className="mt-2 text-xs leading-relaxed text-foam/60">O nome não prova quem é a pessoa. Duas pessoas podem usar o mesmo.</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <p className="mb-3 text-xs font-semibold tracking-[0.14em] text-foam/60 uppercase">{status}</p>
          <PresenceList participants={chat.presence} selfId={selfId} light />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-foam/90 px-3 py-3 backdrop-blur sm:px-5">
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl leading-none text-ink">Conversa privada</h1>
            <p className="mt-1 flex items-center gap-2 text-xs text-muted">
              <span className={`h-2 w-2 rounded-full ${chat.connection === 'online' ? 'bg-tide' : 'bg-copper'}`} />
              {status}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-sand text-ink md:hidden"
              aria-label="Ver participantes online"
              onClick={() => setPeopleOpen(true)}
            >
              <Users size={18} />
            </button>
            <div className="hidden sm:block">
              <ShareButton roomId={roomId} />
            </div>
          </div>
        </header>

        {chat.connection === 'reconnecting' ? (
          <p role="status" className="bg-copper px-4 py-2 text-center text-sm font-medium text-foam">
            Sem conexão. Reconectando automaticamente…
          </p>
        ) : null}
        {chat.notice ? (
          <p role="status" className="bg-tide px-4 py-2 text-center text-sm font-medium text-foam">
            {chat.notice}
          </p>
        ) : null}

        {chat.loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted">
            <LoaderCircle className="animate-spin" size={18} />
            Abrindo histórico…
          </div>
        ) : chat.loadError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="max-w-sm text-sm text-danger">{chat.loadError}</p>
            <Button onClick={() => void chat.reload()}>Tentar de novo</Button>
          </div>
        ) : (
          <MessageList
            messages={chat.messages}
            participantId={selfId}
            hasMore={chat.hasMore}
            loadingOlder={chat.loadingOlder}
            showJump={scroll.showJump}
            listRef={scroll.ref}
            onScroll={scroll.onScroll}
            onLoadOlder={() => void loadOlder()}
            onJump={scroll.jump}
            onRetry={chat.retry}
            onReply={(message) => {
              if (message.status !== 'sent') return;
              setReplyTo({
                id: message.id,
                participantId: message.participantId,
                displayName: message.displayName,
                content: message.content,
              });
            }}
            onOpenOriginal={(messageId) => {
              const node = document.getElementById(`msg-${messageId}`);
              if (!node) return;
              node.scrollIntoView({ behavior: 'smooth', block: 'center' });
              node.classList.add('rounded-3xl', 'ring-2', 'ring-tide/40');
              window.setTimeout(() => node.classList.remove('rounded-3xl', 'ring-2', 'ring-tide/40'), 1400);
            }}
          />
        )}

        <div className="sm:hidden">
          <div className="border-t border-line bg-foam px-3 py-2">
            <ShareButton roomId={roomId} />
          </div>
        </div>
        <Composer
          disabled={chat.loading || Boolean(chat.loadError) || chat.connection !== 'online'}
          reply={
            replyTo
              ? {
                  authorLabel: replyTo.participantId === selfId ? 'Você' : replyTo.displayName,
                  content: replyTo.content,
                }
              : null
          }
          onCancelReply={() => setReplyTo(null)}
          onSend={(content) => {
            scroll.pin();
            chat.send(content, replyTo);
            setReplyTo(null);
          }}
          onSendMedia={async (payload, onProgress, signal) => {
            scroll.pin();
            const message = await uploadAttachment(
              roomId,
              {
                ...payload,
                clientMessageId: createMessageId(),
                replyToId: replyTo?.id,
              },
              onProgress,
              signal,
            );
            chat.accept(message);
            setReplyTo(null);
          }}
        />
      </section>

      {peopleOpen ? (
        <div className="fixed inset-0 z-20 bg-ink/40 md:hidden" onClick={() => setPeopleOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Participantes online"
            className="absolute inset-x-3 top-3 rounded-3xl bg-foam p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl">Online</h2>
              <button type="button" onClick={() => setPeopleOpen(false)} className="text-sm font-semibold text-tide">
                Fechar
              </button>
            </div>
            <PresenceList participants={chat.presence} selfId={selfId} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
