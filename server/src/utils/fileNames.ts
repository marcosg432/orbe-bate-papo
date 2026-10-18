export function sanitizeFileName(value: string): string {
  const trimmed = value.replace(/[\u0000-\u001F\u007F]/g, '').replace(/[\\/]/g, '').trim();
  const base = trimmed.split(/[/\\]/).pop() ?? '';
  const cleaned = base.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^\.+/, '').slice(0, 120).trim();
  return cleaned.length > 0 ? cleaned : 'arquivo';
}

export function contentDisposition(mode: 'inline' | 'attachment', fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
