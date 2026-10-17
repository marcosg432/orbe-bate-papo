import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Brand } from '../components/BrandMark';
import { Button } from '../components/Button';
import { ApiError, createRoom } from '../services/api';

export function HomePage() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setPending(true);
    setError(null);
    try {
      const { room } = await createRoom();
      navigate(`/room/${room.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível criar a conversa.');
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-6 sm:px-8">
      <header>
        <Brand />
      </header>
      <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
        <div>
          <p className="text-sm font-semibold tracking-[0.16em] text-tide uppercase">Sem conta. Sem telefone.</p>
          <h1 className="mt-4 max-w-xl font-display text-5xl leading-[1.05] text-ink sm:text-6xl">
            Uma conversa que só existe para quem tem o link.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
            Crie uma sala, escolha como quer aparecer e compartilhe o endereço. Quem não tiver o link não entra.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3">
            <Button onClick={() => void handleCreate()} disabled={pending} className="px-6 text-base">
              {pending ? 'Criando conversa…' : 'Criar conversa'}
            </Button>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-3">
            <li>
              <p className="font-semibold text-ink">Link imprevisível</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">O endereço é a chave da sala. Ele não aparece em nenhuma lista pública.</p>
            </li>
            <li>
              <p className="font-semibold text-ink">Nome só nesta sala</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">Você escolhe um nome de exibição. Ele não é uma identidade verificada.</p>
            </li>
            <li>
              <p className="font-semibold text-ink">Histórico guardado</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">As mensagens continuam aqui depois que alguém fecha o navegador.</p>
            </li>
          </ul>
          <p className="mt-8 max-w-lg text-xs leading-relaxed text-muted">
            Em produção, o acesso deve usar HTTPS. Esta versão não oferece criptografia de ponta a ponta: o servidor guarda as mensagens para entregar o histórico.
          </p>
        </div>
        <div aria-hidden="true" className="rounded-[2rem] border border-line bg-foam p-4 shadow-[0_24px_70px_rgb(18_56_51_/_10%)] sm:p-6">
          <div className="rounded-[1.5rem] bg-pine-deep px-5 py-4 text-foam">
            <p className="font-display text-2xl">Conversa privada</p>
            <p className="mt-1 text-sm text-foam/70">2 online</p>
          </div>
          <div className="flex flex-col gap-3 px-2 py-6">
            <div className="max-w-[80%] rounded-[1.3rem] rounded-bl-md border border-line bg-white px-4 py-3 text-sm leading-relaxed">
              O link é a chave desta sala.
              <p className="mt-1 text-[11px] text-muted">Lia · 09:14</p>
            </div>
            <div className="ml-auto max-w-[80%] rounded-[1.3rem] rounded-br-md bg-own px-4 py-3 text-sm leading-relaxed text-foam">
              Vou mandar só para quem precisa entrar.
              <p className="mt-1 text-[11px] text-foam/70">Você · 09:15</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
