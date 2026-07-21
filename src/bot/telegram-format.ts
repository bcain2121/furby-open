export const TELEGRAM_MESSAGE_BUDGET = 3_800;

function safeHardSplitIndex(text: string, requestedIndex: number) {
  const previous = text.charCodeAt(requestedIndex - 1);
  const next = text.charCodeAt(requestedIndex);
  const splitsSurrogatePair = previous >= 0xD800 && previous <= 0xDBFF
    && next >= 0xDC00 && next <= 0xDFFF;
  return splitsSurrogatePair ? requestedIndex - 1 : requestedIndex;
}

function preferredSplitIndex(text: string, maxLength: number) {
  const window = text.slice(0, maxLength);
  const minimumUsefulSplit = Math.floor(maxLength / 2);
  for (const separator of ['\n\n', '\n', ' ']) {
    const index = window.lastIndexOf(separator);
    const splitAfterSeparator = index + separator.length;
    if (index >= minimumUsefulSplit && splitAfterSeparator <= maxLength) return splitAfterSeparator;
  }
  return safeHardSplitIndex(text, maxLength);
}

export function splitTelegramText(text: string, maxLength = TELEGRAM_MESSAGE_BUDGET) {
  if (!Number.isInteger(maxLength) || maxLength < 2) throw new Error('Telegram chunk length must be an integer of at least 2.');
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLength) {
    const splitIndex = preferredSplitIndex(remaining, maxLength);
    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex);
  }
  if (remaining.length > 0 || chunks.length === 0) chunks.push(remaining);
  return chunks;
}

function telegramPayloadFits(text: string, maxLength: number) {
  return markdownToTelegramHtml(text).length <= maxLength
    && escapeTelegramHtml(text).length <= maxLength;
}

export function splitTelegramMarkdownText(text: string, maxLength = TELEGRAM_MESSAGE_BUDGET) {
  if (!Number.isInteger(maxLength) || maxLength < 2) throw new Error('Telegram chunk length must be an integer of at least 2.');
  if (!text) return [''];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining) {
    if (telegramPayloadFits(remaining, maxLength)) {
      chunks.push(remaining);
      break;
    }

    const minimumIndex = (remaining.codePointAt(0) ?? 0) > 0xFFFF ? 2 : 1;
    let splitIndex = preferredSplitIndex(remaining, Math.min(maxLength, remaining.length - 1));
    splitIndex = Math.max(minimumIndex, splitIndex);

    while (!telegramPayloadFits(remaining.slice(0, splitIndex), maxLength)) {
      const candidate = remaining.slice(0, splitIndex);
      const payloadLength = Math.max(
        markdownToTelegramHtml(candidate).length,
        escapeTelegramHtml(candidate).length,
      );
      const scaledIndex = Math.floor(splitIndex * (maxLength / payloadLength));
      const nextMaximum = Math.max(minimumIndex, Math.min(splitIndex - 1, scaledIndex));
      splitIndex = Math.max(minimumIndex, preferredSplitIndex(remaining, nextMaximum));
    }

    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex);
  }
  return chunks;
}

export function escapeTelegramHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeHtmlAttribute(text: string) {
  return escapeTelegramHtml(text).replaceAll('"', '&quot;');
}

const TOKEN_PREFIX = '\uE000TGMD';
const TOKEN_SUFFIX = '\uE001';

function token(index: number) {
  return `${TOKEN_PREFIX}${index}${TOKEN_SUFFIX}`;
}

export function markdownToTelegramHtml(text: string) {
  const replacements: string[] = [];

  const withCodeTokens = text.replace(/```([\s\S]*?)```|`([^`\n]+?)`/gu, (_match, block: string | undefined, inline: string | undefined) => {
    const html = block !== undefined
      ? `<pre>${escapeTelegramHtml(block.replace(/^\n|\n$/gu, ''))}</pre>`
      : `<code>${escapeTelegramHtml(inline ?? '')}</code>`;
    replacements.push(html);
    return token(replacements.length - 1);
  });

  let html = escapeTelegramHtml(withCodeTokens);

  html = html.replace(/\[([^\]\n]+?)\]\((https?:\/\/[^\s)<>]+)\)/giu, (_match, label: string, url: string) => {
    return `<a href="${escapeHtmlAttribute(url)}">${label}</a>`;
  });

  html = html.replace(/\*\*([^*\n]+?)\*\*/gu, '<b>$1</b>');
  html = html.replace(/(^|[^*])\*([^*\n]+?)\*/gu, '$1<i>$2</i>');
  html = html.replace(/(^|[^_])_([^_\n]+?)_/gu, '$1<i>$2</i>');

  html = html.replace(new RegExp(`${TOKEN_PREFIX}(\\d+)${TOKEN_SUFFIX}`, 'gu'), (_match, index: string) => replacements[Number(index)] ?? '');

  return html;
}
