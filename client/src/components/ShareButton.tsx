import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { roomUrl } from '../services/messages';

export function ShareButton({ roomId, light = false }: { roomId: string; light?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    const url = roomUrl(roomId);
    setError(null);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Conversa no Orbe', text: 'Entre nesta conversa privada.', url });
        return;
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
      }
    }
    try {
      await copyText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Não foi possível copiar o link.');
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void share()}
        className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold ${
          light ? 'bg-white/10 text-foam hover:bg-white/15' : 'bg-sand text-ink hover:bg-line'
        }`}
      >
        {copied ? <Check size={16} /> : typeof navigator.share === 'function' ? <Share2 size={16} /> : <Copy size={16} />}
        {copied ? 'Link copiado' : 'Compartilhar link'}
      </button>
      {error ? <p className="text-xs text-copper">{error}</p> : null}
    </div>
  );
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', 'true');
  area.style.position = 'fixed';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('copy failed');
}
