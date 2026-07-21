import { defineTool } from '@earendil-works/pi-coding-agent';
import { config } from '../config/env.js';
import { appUserIdForTelegram, openDatabase } from '../db/database.js';
import { getMediaAssetByIdOrRecent, listRecentMediaAssets, updateMediaPreview } from '../db/media.js';
import { compactExtractedText, extractTextFromFile } from '../media/extract.js';
import { mediaJobQueue } from '../media/job-queue.js';
import { resolvePathWithinRoot } from '../storage/vault-path.js';

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: 'text' as const, text }], details };
}

function assetAbsolutePath(vaultPath: string) {
  return resolvePathWithinRoot(config.mobileVaultRoot, vaultPath);
}

export function createMediaTools(telegramUserId: number) {
  const userId = appUserIdForTelegram(telegramUserId);
  return [
    defineTool({
      name: 'furby_media_recent',
      label: 'Recent Assistant Media',
      description: 'List recent files, images, and voice messages uploaded through Telegram when the user refers to a recent attachment.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', default: 10 } },
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const db = openDatabase();
        try {
          const rows = listRecentMediaAssets(db, userId, Number(params.limit ?? 10));
          return textResult(JSON.stringify(rows, null, 2), { count: rows.length });
        } finally {
          db.close();
        }
      },
    }),
    defineTool({
      name: 'furby_media_extract_text',
      label: 'Extract Furby Media Text',
      description: 'Extract text from an uploaded document/PDF/text file. If assetId is omitted, extracts the most recent uploaded media asset.',
      parameters: {
        type: 'object',
        properties: {
          assetId: { type: 'string', description: 'Optional media asset id, source id, or vault path. Defaults to most recent upload.' },
          maxChars: { type: 'number', default: 20000 },
        },
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => mediaJobQueue.run(async () => {
        const db = openDatabase();
        try {
          const asset = getMediaAssetByIdOrRecent(db, userId, params.assetId ? String(params.assetId) : undefined);
          if (!asset) return textResult('No uploaded media assets found.', { found: false });
          const absolutePath = assetAbsolutePath(asset.vault_path);
          const extracted = await extractTextFromFile(absolutePath, asset.mime_type ?? '');
          const compact = compactExtractedText(extracted, Number(params.maxChars ?? 20000));
          updateMediaPreview(db, asset.id, compact.slice(0, 4000));
          return textResult(compact, {
            assetId: asset.id,
            vaultPath: asset.vault_path,
            mimeType: asset.mime_type,
            extractedChars: extracted.length,
            returnedChars: compact.length,
          });
        } finally {
          db.close();
        }
      }),
    }),
  ];
}
