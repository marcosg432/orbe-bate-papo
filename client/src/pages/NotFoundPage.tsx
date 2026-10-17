import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5">
      <p className="text-sm font-semibold tracking-[0.16em] text-tide uppercase">404</p>
      <h1 className="mt-3 font-display text-5xl text-ink">Esta página não existe.</h1>
      <p className="mt-3 text-muted">O endereço não corresponde a nenhuma tela do Orbe.</p>
      <Link to="/" className="mt-6 inline-flex text-sm font-semibold text-tide">
        Voltar ao início
      </Link>
    </main>
  );
}
