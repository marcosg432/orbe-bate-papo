export function isOriginAllowed(origin: string | undefined, host: string | undefined, allowedOrigin: string): boolean {
  if (!origin) return true;
  if (origin === allowedOrigin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
