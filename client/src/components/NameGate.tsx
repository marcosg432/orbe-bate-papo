import { FormEvent, useState } from 'react';
import { Button } from './Button';

type NameGateProps = {
  error: string | null;
  pending: boolean;
  onSubmit: (displayName: string) => Promise<void>;
};

export function NameGate({ error, pending, onSubmit }: NameGateProps) {
  const [name, setName] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2 || pending) return;
    await onSubmit(trimmed);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <p className="text-sm font-semibold tracking-[0.16em] text-tide uppercase">Entrar na sala</p>
      <h1 className="mt-3 font-display text-4xl leading-tight text-ink">Como você quer aparecer?</h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        O nome é só um rótulo nesta conversa. Outra pessoa pode escolher o mesmo, e ele não substitui uma conta.
      </p>
      <form onSubmit={handleSubmit} className="mt-8 rounded-[1.6rem] border border-line bg-foam p-5 shadow-[0_20px_50px_rgb(28_25_21_/_6%)]">
        <label htmlFor="display-name" className="text-sm font-semibold text-ink">
          Nome de exibição
        </label>
        <input
          id="display-name"
          value={name}
          maxLength={40}
          autoComplete="nickname"
          autoFocus
          onChange={(event) => setName(event.target.value)}
          placeholder="Por exemplo, Marina"
          className="mt-2 w-full rounded-2xl border border-line bg-white px-4 py-3 text-base text-ink outline-none"
        />
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="mt-5 w-full" disabled={pending || name.trim().length < 2}>
          {pending ? 'Entrando…' : 'Entrar na conversa'}
        </Button>
      </form>
    </main>
  );
}
