export function recorderErrorMessage(error: unknown): string {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'O microfone não foi permitido. Você pode autorizar nas configurações do navegador.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return 'Nenhum microfone foi encontrado neste dispositivo.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'O microfone está em uso ou não pôde ser iniciado.';
  }
  return 'Não foi possível gravar o áudio.';
}
