import { FormEvent, useState } from 'react';
import { Send } from 'lucide-react';

type ComposerProps = {
  disabled: boolean;
  onSend: (content: string) => void;
};

export function Composer({ disabled, onSend }: ComposerProps) {
  const [value, setValue] = useState('');

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
      <div className="mx-auto flex max-w-3xl items-end gap-2">
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
      {value.length > 1600 ? (
        <p className="mx-auto mt-1 max-w-3xl text-right text-xs text-muted">{value.length}/2000</p>
      ) : null}
    </form>
  );
}
