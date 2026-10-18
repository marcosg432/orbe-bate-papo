import { FormEvent, useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, Film, ImagePlus, Mic, Paperclip, Send, Square, X } from 'lucide-react';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { fileTooLargeMessage, formatBytes, formatDuration, MEDIA_LIMITS } from '../services/uploads';
import type { MediaKind } from '../types';

type ComposerReply = {
  authorLabel: string;
  content: string;
};

type FileDraft = {
  kind: Exclude<MediaKind, 'audio'>;
  file: File;
  previewUrl: string | null;
};

type ComposerProps = {
  disabled: boolean;
  reply: ComposerReply | null;
  onCancelReply: () => void;
  onSend: (content: string) => void;
  onSendMedia: (
    payload: { file: Blob; fileName: string; kind: MediaKind; durationMs?: number },
    onProgress: (ratio: number) => void,
    signal: AbortSignal,
  ) => Promise<void>;
};

export function Composer({ disabled, reply, onCancelReply, onSend, onSendMedia }: ComposerProps) {
  const [value, setValue] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState<FileDraft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const voice = useVoiceRecorder();
  const abortRef = useRef<AbortController | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLInputElement>(null);
  const sending = progress !== null;

  useEffect(() => {
    if (!reply) return;
    document.getElementById('message')?.focus();
  }, [reply]);

  useEffect(() => {
    return () => {
      if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    };
  }, [draft]);

  function clearDraft() {
    if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    setDraft(null);
    setDraftError(null);
    setProgress(null);
  }

  function chooseFile(kind: FileDraft['kind'], file: File | undefined) {
    setMenuOpen(false);
    if (!file) return;
    voice.cancel();
    if (file.size > MEDIA_LIMITS[kind]) {
      setDraftError(fileTooLargeMessage(kind));
      return;
    }
    if (draft?.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    const previewUrl = kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : null;
    setDraftError(null);
    setDraft({ kind, file, previewUrl });
  }

  function submit() {
    if (disabled || sending) return;
    if (voice.phase === 'preview' && voice.blob && voice.mime) {
      void sendMedia({
        file: voice.blob,
        fileName: voiceFileName(voice.mime),
        kind: 'audio',
        durationMs: voice.elapsedMs,
      });
      return;
    }
    if (draft) {
      void sendMedia({ file: draft.file, fileName: draft.file.name, kind: draft.kind });
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) return;
    try {
      onSend(trimmed);
    } catch {
      return;
    }
    setValue('');
  }

  async function sendMedia(payload: { file: Blob; fileName: string; kind: MediaKind; durationMs?: number }) {
    const controller = new AbortController();
    abortRef.current = controller;
    setDraftError(null);
    setProgress(0);
    try {
      await onSendMedia(payload, setProgress, controller.signal);
      clearDraft();
      voice.cancel();
      setProgress(null);
    } catch (error) {
      setProgress(null);
      if (controller.signal.aborted) return;
      setDraftError(error instanceof Error ? error.message : 'Não foi possível enviar o arquivo.');
    } finally {
      abortRef.current = null;
    }
  }

  function cancelUpload() {
    abortRef.current?.abort();
    setProgress(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  const busy = disabled || sending || voice.phase === 'recording';
  const canSend = !busy && (value.trim().length > 0 || Boolean(draft) || (voice.phase === 'preview' && Boolean(voice.blob)));

  return (
    <form onSubmit={handleSubmit} className="border-t border-line bg-foam/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-5">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        {reply ? (
          <div className="flex items-stretch gap-2">
            <div className="min-w-0 flex-1 rounded-2xl border-l-4 border-tide bg-sand px-3 py-2">
              <p className="text-xs font-semibold text-tide">Respondendo a {reply.authorLabel}</p>
              <p className="truncate text-sm text-ink/80">{reply.content}</p>
            </div>
            <button type="button" aria-label="Cancelar resposta" onClick={onCancelReply} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sand hover:text-ink">
              <X size={16} />
            </button>
          </div>
        ) : null}

        {draft ? (
          <div className="rounded-2xl border border-line bg-sand/70 p-3">
            {draft.kind === 'image' && draft.previewUrl ? <img src={draft.previewUrl} alt="" className="mb-2 max-h-40 rounded-xl object-cover" /> : null}
            {draft.kind === 'video' && draft.previewUrl ? <video src={draft.previewUrl} controls className="mb-2 max-h-40 w-full rounded-xl" /> : null}
            <p className="truncate text-sm font-semibold text-ink">{draft.file.name}</p>
            <p className="text-xs text-muted">{formatBytes(draft.file.size)}</p>
            {progress !== null ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                <div className="h-full bg-tide" style={{ width: `${progress}%` }} />
              </div>
            ) : null}
            <div className="mt-2 flex gap-3">
              {sending ? (
                <button type="button" className="text-xs font-semibold text-copper" onClick={cancelUpload}>
                  Cancelar envio
                </button>
              ) : (
                <button type="button" className="text-xs font-semibold text-muted" onClick={clearDraft}>
                  Remover
                </button>
              )}
            </div>
          </div>
        ) : null}

        {voice.phase === 'recording' ? (
          <div className="flex items-center justify-between rounded-2xl bg-sand px-3 py-2">
            <p className="text-sm font-semibold text-danger">Gravando · {formatDuration(voice.elapsedMs)}</p>
            <div className="flex gap-2">
              <button type="button" className="text-xs font-semibold text-muted" onClick={voice.cancel}>
                Cancelar
              </button>
              <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-ink" onClick={voice.stop}>
                <Square size={12} />
                Parar
              </button>
            </div>
          </div>
        ) : null}

        {voice.phase === 'preview' && voice.previewUrl ? (
          <div className="rounded-2xl border border-line bg-sand/70 p-3">
            <audio controls src={voice.previewUrl} className="w-full" />
            <p className="mt-1 text-xs text-muted">{formatDuration(voice.elapsedMs)}</p>
            {progress !== null ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                <div className="h-full bg-tide" style={{ width: `${progress}%` }} />
              </div>
            ) : null}
            <button type="button" className="mt-2 text-xs font-semibold text-muted" onClick={sending ? cancelUpload : voice.cancel}>
              {sending ? 'Cancelar envio' : 'Descartar áudio'}
            </button>
          </div>
        ) : null}

        {draftError || voice.error ? <p className="text-sm text-danger">{draftError || voice.error}</p> : null}

        <div className="flex items-end gap-2">
          <div className="relative">
            <button
              type="button"
              aria-label="Anexar arquivo"
              disabled={busy}
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-sand disabled:opacity-50"
            >
              <Paperclip size={18} />
            </button>
            {menuOpen ? (
              <div className="absolute bottom-12 left-0 z-10 w-44 rounded-2xl border border-line bg-foam p-1 shadow-lg">
                <MenuButton icon={<ImagePlus size={16} />} label="Foto" onClick={() => imageRef.current?.click()} />
                <MenuButton icon={<Film size={16} />} label="Vídeo" onClick={() => videoRef.current?.click()} />
                <MenuButton icon={<FileText size={16} />} label="Documento" onClick={() => documentRef.current?.click()} />
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={voice.phase === 'recording' ? 'Parar gravação' : 'Gravar áudio'}
            disabled={disabled || sending || Boolean(draft)}
            onClick={voice.phase === 'recording' ? voice.stop : voice.phase === 'preview' ? voice.cancel : () => void voice.start()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-sand disabled:opacity-50"
          >
            <Mic size={18} />
          </button>
          <label htmlFor="message" className="sr-only">
            Mensagem
          </label>
          <textarea
            id="message"
            rows={1}
            maxLength={2000}
            value={value}
            disabled={busy || Boolean(draft) || voice.phase !== 'idle'}
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
            disabled={!canSend}
            onClick={submit}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pine text-foam transition hover:bg-tide disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={18} className="pointer-events-none" />
          </button>
        </div>
        {value.length > 1600 ? <p className="text-right text-xs text-muted">{value.length}/2000</p> : null}
      </div>
      <input ref={imageRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(event) => { chooseFile('image', event.target.files?.[0]); event.target.value = ''; }} />
      <input ref={videoRef} type="file" accept="video/mp4,video/webm" className="hidden" onChange={(event) => { chooseFile('video', event.target.files?.[0]); event.target.value = ''; }} />
      <input
        ref={documentRef}
        type="file"
        accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(event) => { chooseFile('document', event.target.files?.[0]); event.target.value = ''; }}
      />
    </form>
  );
}

function MenuButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-sand">
      {icon}
      {label}
    </button>
  );
}

function voiceFileName(mime: string): string {
  if (mime.includes('ogg')) return 'audio.ogg';
  if (mime.includes('mp4')) return 'audio.m4a';
  return 'audio.webm';
}
