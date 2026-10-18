import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { attachmentUrl, formatBytes, formatDuration } from '../services/uploads';
import type { Attachment, MediaKind } from '../types';

export function MediaMessage({ roomId, kind, attachment }: { roomId: string; kind: MediaKind; attachment: Attachment }) {
  const [viewer, setViewer] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const source = attachmentUrl(roomId, attachment.id);
  const download = attachmentUrl(roomId, attachment.id, true);

  if (kind === 'image') {
    return (
      <>
        <button type="button" className="block w-full overflow-hidden rounded-2xl" onClick={() => setViewer(true)}>
          <img src={source} alt={attachment.fileName} className="max-h-72 min-h-28 w-full bg-black/10 object-contain" />
        </button>
        <DownloadLink href={download} />
        {viewer ? <ImageViewer src={source} download={download} name={attachment.fileName} onClose={() => setViewer(false)} /> : null}
      </>
    );
  }

  if (kind === 'video') {
    return (
      <div>
        {playbackError ? (
          <p className="text-sm">Este navegador não reproduz este vídeo. Você pode baixá-lo.</p>
        ) : (
          <video controls preload="metadata" src={source} className="max-h-72 w-full rounded-2xl" onError={() => setPlaybackError(true)} />
        )}
        <DownloadLink href={download} />
      </div>
    );
  }

  if (kind === 'audio') {
    return (
      <div className="min-w-56">
        <p className="mb-1 text-xs opacity-80">{attachment.durationMs ? formatDuration(attachment.durationMs) : 'Áudio'}</p>
        {playbackError ? (
          <p className="text-sm">Este navegador não reproduz este áudio. Você pode baixá-lo.</p>
        ) : (
          <audio controls preload="metadata" src={source} className="w-full" onError={() => setPlaybackError(true)} />
        )}
        <DownloadLink href={download} />
      </div>
    );
  }

  return (
    <div className="min-w-52">
      <p className="font-semibold">{attachment.fileName}</p>
      <p className="mt-1 text-xs opacity-80">
        {documentLabel(attachment.mimeType)} · {formatBytes(attachment.sizeBytes)}
      </p>
      <DownloadLink href={download} />
    </div>
  );
}

function DownloadLink({ href }: { href: string }) {
  return (
    <a href={href} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline">
      <Download size={14} />
      Baixar
    </a>
  );
}

function ImageViewer({ src, download, name, onClose }: { src: string; download: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/80 p-4" role="dialog" aria-modal="true" aria-label={name} onClick={onClose}>
      <button type="button" className="absolute top-4 right-4 rounded-full bg-foam px-3 py-2 text-sm font-semibold text-ink" onClick={onClose}>
        Fechar
      </button>
      <img src={src} alt={name} className="max-h-[85vh] max-w-full rounded-2xl object-contain" onClick={(event) => event.stopPropagation()} />
      <a href={download} className="absolute bottom-4 inline-flex items-center gap-2 rounded-full bg-foam px-4 py-2 text-sm font-semibold text-ink" onClick={(event) => event.stopPropagation()}>
        <Download size={16} />
        Baixar
      </a>
    </div>
  );
}

function documentLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === 'text/plain') return 'TXT';
  if (mimeType.includes('wordprocessingml')) return 'DOCX';
  return 'Documento';
}
