import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  escapeTelegramHtml,
  markdownToTelegramHtml,
  splitTelegramMarkdownText,
  splitTelegramText,
  TELEGRAM_MESSAGE_BUDGET,
} from '../src/bot/telegram-format.js';

test('escapes raw HTML', () => {
  assert.equal(escapeTelegramHtml('<b>&</b>'), '&lt;b&gt;&amp;&lt;/b&gt;');
});

test('converts common model markdown to Telegram HTML', () => {
  assert.equal(
    markdownToTelegramHtml('**bold** *italic* `code` [link](https://example.com)'),
    '<b>bold</b> <i>italic</i> <code>code</code> <a href="https://example.com">link</a>',
  );
});

test('keeps prices and em dashes readable', () => {
  assert.equal(markdownToTelegramHtml('Price: $2.69 — good.'), 'Price: $2.69 — good.');
});

test('does not format markdown inside code spans or fences', () => {
  assert.equal(markdownToTelegramHtml('`**literal**`'), '<code>**literal**</code>');
  assert.equal(markdownToTelegramHtml('```\n**literal**\n```'), '<pre>**literal**</pre>');
});

test('splits oversized Telegram text without losing content', () => {
  const text = `${'first paragraph '.repeat(300)}\n\n${'second paragraph '.repeat(300)}`;
  const chunks = splitTelegramText(text);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= TELEGRAM_MESSAGE_BUDGET));
  assert.equal(chunks.join(''), text);
});

test('splits link-heavy Markdown by final Telegram payload size', () => {
  const text = Array.from({ length: 90 }, (_, index) => (
    `${index + 1}. [Google Maps destination ${index + 1}](https://www.google.com/maps/search/?api=1&query=Joshua+Tree+destination+${index + 1})`
  )).join('\n');
  const chunks = splitTelegramMarkdownText(text);

  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every((chunk) => markdownToTelegramHtml(chunk).length <= TELEGRAM_MESSAGE_BUDGET));
  assert.ok(chunks.every((chunk) => escapeTelegramHtml(chunk).length <= TELEGRAM_MESSAGE_BUDGET));
});

test('hard-splits oversized unbroken text without breaking emoji surrogate pairs', () => {
  const text = `${'x'.repeat(TELEGRAM_MESSAGE_BUDGET - 1)}😀${'y'.repeat(TELEGRAM_MESSAGE_BUDGET)}`;
  const chunks = splitTelegramText(text);

  assert.ok(chunks.every((chunk) => chunk.length <= TELEGRAM_MESSAGE_BUDGET));
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every((chunk) => !chunk.includes('\uFFFD')));
  assert.ok(chunks.every((chunk) => {
    const first = chunk.charCodeAt(0);
    const last = chunk.charCodeAt(chunk.length - 1);
    return !(first >= 0xDC00 && first <= 0xDFFF) && !(last >= 0xD800 && last <= 0xDBFF);
  }));
});
