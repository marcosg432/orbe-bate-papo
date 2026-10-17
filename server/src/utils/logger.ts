const SENSITIVE_KEYS = new Set([
  'token',
  'cookie',
  'cookies',
  'authorization',
  'roomId',
  'room_id',
  'session',
  'sessionToken',
  'link',
  'password',
  'email',
  'phone',
]);

export function redact(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) return {};
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    safe[key] = value;
  }
  return safe;
}

function write(level: 'info' | 'error', message: string, meta?: Record<string, unknown>): void {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...redact(meta),
  });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    write('info', message, meta);
  },
  error(message: string, meta?: Record<string, unknown>): void {
    write('error', message, meta);
  },
};
