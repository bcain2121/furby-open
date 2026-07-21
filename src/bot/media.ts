import path from 'node:path';
import { config } from '../config/env.js';
import { appUserIdForTelegram, openDatabase } from '../db/database.js';
import { insertMediaAsset, lightweightPreview, sha256Buffer, writeVaultFile, type SavedMediaAsset } from '../db/media.js';

const MAX_TELEGRAM_DOWNLOAD_BYTES = 25 * 1024 * 1024;

export interface TelegramFileLike {
  file_id: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

function extensionForMime(mimeType: string) {
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/gif') return '.gif';
  if (mimeType === 'audio/ogg') return '.ogg';
  if (mimeType === 'audio/mpeg') return '.mp3';
  if (mimeType === 'application/pdf') return '.pdf';
  if (mimeType === 'text/plain') return '.txt';
  return '';
}

function sanitizeFilename(name: string) {
  return name.replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 160) || 'telegram-file';
}

async function downloadTelegramFile(fileId: string) {
  const fileResponse = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!fileResponse.ok) throw new Error(`Telegram getFile failed with HTTP ${fileResponse.status}`);
  const filePayload = await fileResponse.json() as { ok: boolean; result?: { file_path?: string }; description?: string };
  if (!filePayload.ok || !filePayload.result?.file_path) {
    throw new Error(`Telegram getFile failed: ${filePayload.description ?? 'missing file_path'}`);
  }

  const downloadUrl = `https://api.telegram.org/file/bot${config.telegramBotToken}/${filePayload.result.file_path}`;
  const downloadResponse = await fetch(downloadUrl);
  if (!downloadResponse.ok) throw new Error(`Telegram file download failed with HTTP ${downloadResponse.status}`);
  const contentLength = Number(downloadResponse.headers.get('content-length') ?? 0);
  if (contentLength > MAX_TELEGRAM_DOWNLOAD_BYTES) throw new Error(`Telegram file exceeds the ${MAX_TELEGRAM_DOWNLOAD_BYTES}-byte download limit.`);
  const buffer = Buffer.from(await downloadResponse.arrayBuffer());
  if (buffer.length > MAX_TELEGRAM_DOWNLOAD_BYTES) throw new Error(`Telegram file exceeds the ${MAX_TELEGRAM_DOWNLOAD_BYTES}-byte download limit.`);
  return buffer;
}

export async function saveTelegramMedia(input: {
  telegramUserId: number;
  file: TelegramFileLike;
  kind: 'photo' | 'document' | 'voice' | 'audio';
  fallbackMimeType: string;
  fallbackName: string;
}) : Promise<SavedMediaAsset> {
  if ((input.file.file_size ?? 0) > MAX_TELEGRAM_DOWNLOAD_BYTES) {
    throw new Error(`Telegram file exceeds the ${MAX_TELEGRAM_DOWNLOAD_BYTES}-byte download limit.`);
  }
  const buffer = await downloadTelegramFile(input.file.file_id);
  const mimeType = input.file.mime_type || input.fallbackMimeType;
  const date = new Date().toISOString().slice(0, 10);
  const sourceId = input.file.file_unique_id || input.file.file_id;
  const extension = path.extname(input.file.file_name || '') || extensionForMime(mimeType);
  const originalFilename = sanitizeFilename(input.file.file_name || `${input.fallbackName}-${sourceId}${extension}`);
  const relativePath = path.join('telegram', date, input.kind, originalFilename);
  const written = writeVaultFile(config.mobileVaultRoot, relativePath, buffer);
  const digest = sha256Buffer(buffer);
  const previewText = lightweightPreview(buffer, mimeType, originalFilename);

  const db = openDatabase();
  try {
    const id = insertMediaAsset(db, {
      userId: appUserIdForTelegram(input.telegramUserId),
      sourceId,
      originalFilename,
      vaultPath: written.vaultPath,
      mimeType,
      sizeBytes: buffer.length,
      sha256: digest,
      previewText,
      metadata: {
        telegram_file_id: input.file.file_id,
        telegram_file_unique_id: input.file.file_unique_id ?? null,
        kind: input.kind,
      },
    });
    return {
      id,
      vaultPath: written.vaultPath,
      absolutePath: written.absolutePath,
      mimeType,
      previewText,
      sizeBytes: buffer.length,
      sha256: digest,
    };
  } finally {
    db.close();
  }
}
