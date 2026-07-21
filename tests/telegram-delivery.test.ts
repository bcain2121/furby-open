import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sendTelegramMarkdownChunks } from '../src/bot/telegram-delivery.js';
import { TELEGRAM_MESSAGE_BUDGET } from '../src/bot/telegram-format.js';

test('sends long Markdown as sequential Telegram-sized HTML messages', async () => {
  const sent: string[] = [];
  const text = `**Result**\n\n${'long response '.repeat(1_000)}`;

  await sendTelegramMarkdownChunks(async (body) => {
    sent.push(body);
  }, text, { interChunkDelayMs: 0 });

  assert.ok(sent.length > 1);
  assert.ok(sent.every((body) => body.length <= TELEGRAM_MESSAGE_BUDGET + 20));
  assert.match(sent[0], /^<b>Result<\/b>/u);
});

test('retries only a rejected formatted chunk as escaped plain text', async () => {
  const attempts: string[] = [];

  await sendTelegramMarkdownChunks(async (body) => {
    attempts.push(body);
    if (attempts.length === 1) throw new Error('Bad Request: cannot parse entities');
  }, '**bold** & <literal>');

  assert.deepEqual(attempts, [
    '<b>bold</b> &amp; &lt;literal&gt;',
    '**bold** &amp; &lt;literal&gt;',
  ]);
});

test('retries a Telegram 429 after retry_after without falling back to plain text', async () => {
  const attempts: string[] = [];
  const delays: number[] = [];

  await sendTelegramMarkdownChunks(async (body) => {
    attempts.push(body);
    if (attempts.length === 1) {
      throw Object.assign(new Error('Too Many Requests: retry after 2'), {
        error_code: 429,
        parameters: { retry_after: 2 },
      });
    }
  }, '**bold**', {
    sleep: async (delayMs) => { delays.push(delayMs); },
  });

  assert.deepEqual(attempts, ['<b>bold</b>', '<b>bold</b>']);
  assert.deepEqual(delays, [2_100]);
});

test('paces sequential chunks to avoid Telegram flood limits', async () => {
  const sent: string[] = [];
  const delays: number[] = [];
  const text = `${'first '.repeat(700)}${'second '.repeat(700)}`;

  await sendTelegramMarkdownChunks(async (body) => {
    sent.push(body);
  }, text, {
    interChunkDelayMs: 1_000,
    sleep: async (delayMs) => { delays.push(delayMs); },
  });

  assert.ok(sent.length > 1);
  assert.deepEqual(delays, Array.from({ length: sent.length - 1 }, () => 1_000));
});

test('does not mistake a non-formatting send failure for malformed Markdown', async () => {
  const attempts: string[] = [];
  const failure = Object.assign(new Error('Bad Gateway'), { error_code: 502 });

  await assert.rejects(
    sendTelegramMarkdownChunks(async (body) => {
      attempts.push(body);
      throw failure;
    }, '**bold**'),
    failure,
  );

  assert.deepEqual(attempts, ['<b>bold</b>']);
});
