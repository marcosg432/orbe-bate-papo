import { FormEvent, useEffect, useState } from 'react';
import { Send, X } from 'lucide-react';

type ComposerReply = {
  authorLabel: string;
  content: string;
};

type ComposerProps = {
  disabled: boolean;
  reply: ComposerReply | null;
  onCancelReply: () => void;
  onSend: (content: string) => void;
};

export function Composer({ disabled, reply, onCancelReply, onSend }: ComposerProps) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!reply) return;
    document.getElementById('message')?.focus();
  }, [reply]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    try {
      onSend(trimmed);
    } catch {
      return;
    }
    setValue('');
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-line bg-foam/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-5">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        {reply ? (
          <div className="flex items-stretch gap-2">
            <div className="min-w-0 flex-1 rounded-2xl border-l-4 border-tide bg-sand px-3 py-2">
              <p className="text-xs font-semibold text-tide">Respondendo a {reply.authorLabel}</p>
              <p className="truncate text-sm text-ink/80">{reply.content}</p>
            </div>
            <button
              type="button"
              aria-label="Cancelar resposta"
              onClick={onCancelReply}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sand hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <label htmlFor="message" className="sr-only">
            Mensagem
          </label>
          <textarea
            id="message"
            rows={1}
            maxLength={2000}
            value={value}
            disabled={disabled}
            placeholder={disabled ? 'Aguardando conexão…' : 'Escreva uma mensagem'}
            onChange={(event) => {
              setValue(event.target.value);
              const element = event.target;
              element.style.height = '0px';
              element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && reply) {
                event.preventDefault();
                onCancelReply();
                return;
              }
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            className="max-h-40 min-h-11 flex-1 rounded-3xl border border-line bg-white px-4 py-2.5 text-base leading-6 text-ink outline-none disabled:bg-sand"
          />
          <button
            type="button"
            aria-label="Enviar mensagem"
            disabled={disabled || value.trim().length === 0}
            onClick={submit}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pine text-foam transition hover:bg-tide disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={18} className="pointer-events-none" />
          </button>
        </div>
        {value.length > 1600 ? <p className="text-right text-xs text-muted">{value.length}/2000</p> : null}
      </div>
    </form>
  );
}
