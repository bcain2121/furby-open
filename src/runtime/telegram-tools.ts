import fs from 'node:fs';
import path from 'node:path';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { config } from '../config/env.js';
import { resolveVaultPath, vaultRelativePath } from './vault-tools.js';

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: 'text' as const, text }], details };
}

const MAX_TELEGRAM_SEND_BYTES = 50 * 1024 * 1024;
const sensitivePattern = /(^|[/\\])(\.env|id_rsa|id_ed25519|.*\.(?:key|pem|p12|sqlite|db))$/iu;

function resolveSendablePath(inputPath: string) {
  const raw = inputPath.trim();
  let absolutePath: string;
  try {
    absolutePath = resolveVaultPath(raw);
  } catch {
    throw new Error('Telegram send tool only sends files from the configured workspace. Copy the file there first.');
  }
  if (sensitivePattern.test(absolutePath)) throw new Error('Refusing to send a sensitive/runtime file.');
  if (!fs.existsSync(absolutePath)) throw new Error(`File not found: ${inputPath}`);
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) throw new Error('Path is not a file.');
  if (stat.size > MAX_TELEGRAM_SEND_BYTES) throw new Error(`File exceeds Telegram's ${MAX_TELEGRAM_SEND_BYTES}-byte send limit.`);
  return absolutePath;
}

function guessKind(filePath: string, explicitKind?: string) {
  if (explicitKind === 'photo' || explicitKind === 'document') return explicitKind;
  if (/\.(?:png|jpe?g|webp)$/iu.test(filePath)) return 'photo';
  return 'document';
}

async function sendTelegramFile(filePath: string, caption?: string, kind?: string) {
  if (!config.telegramBotToken || !config.telegramUserId) throw new Error('Telegram bot token/user id is not configured.');
  const sendKind = guessKind(filePath, kind);
  const endpoint = sendKind === 'photo' ? 'sendPhoto' : 'sendDocument';
  const fieldName = sendKind === 'photo' ? 'photo' : 'document';
  const form = new FormData();
  form.set('chat_id', String(config.telegramUserId));
  if (caption) form.set('caption', caption.slice(0, 1024));
  const bytes = await fs.promises.readFile(filePath);
  const blob = new Blob([bytes]);
  form.set(fieldName, blob, path.basename(filePath));
  const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${endpoint}`, {
    method: 'POST',
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok) {
    throw new Error(`Telegram ${endpoint} failed: ${payload?.description ?? response.statusText}`);
  }
  return payload;
}

export async function sendVaultFileToTelegram(inputPath: string, caption?: string, kind?: string) {
  const absolutePath = resolveSendablePath(inputPath);
  const payload = await sendTelegramFile(absolutePath, caption, kind);
  return {
    absolutePath,
    vaultPath: vaultRelativePath(absolutePath),
    messageId: payload?.result?.message_id,
    kind: guessKind(absolutePath, kind),
  };
}

export function createTelegramTools() {
  return [
    defineTool({
      name: 'furby_telegram_send_file',
      label: 'Send Workspace File on Telegram',
      description: `Send a generated image or workspace file to ${config.ownerName} on Telegram. The file must remain inside the configured workspace.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Workspace-relative path or absolute path under the configured workspace.' },
          caption: { type: 'string', description: 'Optional Telegram caption.' },
          kind: { type: 'string', enum: ['photo', 'document'], description: 'Optional send mode. Defaults to photo for images.' },
        },
        required: ['path'],
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const result = await sendVaultFileToTelegram(String(params.path), params.caption ? String(params.caption) : undefined, params.kind ? String(params.kind) : undefined);
        return textResult(`Sent ${result.vaultPath} to Telegram.`, result);
      },
    }),
  ];
}
