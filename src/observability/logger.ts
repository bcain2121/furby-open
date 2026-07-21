import crypto from 'node:crypto';

const SENSITIVE_KEY = /token|secret|password|authorization|api.?key/iu;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitize(item),
  ]));
}

export function correlationId(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

export function logEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  details: Record<string, unknown> = {},
) {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitize(details) as Record<string, unknown>,
  });
  if (level === 'error') console.error(record);
  else if (level === 'warn') console.warn(record);
  else console.log(record);
}
