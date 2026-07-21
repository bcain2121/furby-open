import {
  escapeTelegramHtml,
  markdownToTelegramHtml,
  splitTelegramMarkdownText,
} from './telegram-format.js';

export type TelegramHtmlSender = (
  body: string,
  options: { parse_mode: 'HTML' },
) => Promise<unknown>;

export interface TelegramMarkdownDeliveryOptions {
  onFormattedChunkError?: (error: unknown, chunkIndex: number) => void;
  onRateLimitRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  interChunkDelayMs?: number;
  maxRateLimitRetries?: number;
  sleep?: (delayMs: number) => Promise<void>;
}

const DEFAULT_INTER_CHUNK_DELAY_MS = 1_000;
const DEFAULT_MAX_RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_RETRY_BUFFER_MS = 100;

function errorRecord(error: unknown) {
  return error && typeof error === 'object' ? error as Record<string, any> : {};
}

function isTelegramRateLimitError(error: unknown) {
  const record = errorRecord(error);
  return Number(record.error_code ?? record.error?.error_code) === 429
    || /too many requests/iu.test(error instanceof Error ? error.message : String(error));
}

function telegramRetryAfterMs(error: unknown) {
  const record = errorRecord(error);
  const seconds = Number(record.parameters?.retry_after ?? record.error?.parameters?.retry_after);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : DEFAULT_INTER_CHUNK_DELAY_MS;
}

function isTelegramFormattingError(error: unknown) {
  const record = errorRecord(error);
  const code = Number(record.error_code ?? record.error?.error_code);
  const message = [record.description, record.error?.description, error instanceof Error ? error.message : String(error)]
    .filter(Boolean)
    .join(' ');
  return (code === 400 || !Number.isFinite(code))
    && /can(?:not|'t) parse entities|unsupported start tag|can't find end tag|wrong entity/iu.test(message);
}

async function sendWithRateLimitRetry(
  send: TelegramHtmlSender,
  body: string,
  options: TelegramMarkdownDeliveryOptions,
) {
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const maxRetries = options.maxRateLimitRetries ?? DEFAULT_MAX_RATE_LIMIT_RETRIES;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await send(body, { parse_mode: 'HTML' });
    } catch (error) {
      if (!isTelegramRateLimitError(error) || attempt >= maxRetries) throw error;
      const delayMs = telegramRetryAfterMs(error) + RATE_LIMIT_RETRY_BUFFER_MS;
      options.onRateLimitRetry?.(error, attempt + 1, delayMs);
      await sleep(delayMs);
    }
  }
}

export async function sendTelegramMarkdownChunks(
  send: TelegramHtmlSender,
  text: string,
  options: TelegramMarkdownDeliveryOptions = {},
) {
  const chunks = splitTelegramMarkdownText(text);
  const sleep = options.sleep ?? ((delayMs: number) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  const interChunkDelayMs = options.interChunkDelayMs ?? DEFAULT_INTER_CHUNK_DELAY_MS;
  for (const [index, chunk] of chunks.entries()) {
    if (index > 0 && interChunkDelayMs > 0) await sleep(interChunkDelayMs);
    try {
      await sendWithRateLimitRetry(send, markdownToTelegramHtml(chunk), options);
    } catch (error) {
      if (!isTelegramFormattingError(error)) throw error;
      options.onFormattedChunkError?.(error, index);
      await sendWithRateLimitRetry(send, escapeTelegramHtml(chunk), options);
    }
  }
}
