import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { resolvePathWithinRoot } from '../storage/vault-path.js';

export interface SavedMediaAsset {
  id: string;
  vaultPath: string;
  absolutePath: string;
  mimeType: string;
  previewText: string;
  sizeBytes: number;
  sha256: string;
}

export function sha256Buffer(buffer: Buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function lightweightPreview(buffer: Buffer, mimeType: string, filename: string) {
  const lowerName = filename.toLowerCase();
  if (mimeType.startsWith('text/') || lowerName.endsWith('.md') || lowerName.endsWith('.txt') || lowerName.endsWith('.csv') || lowerName.endsWith('.json')) {
    return buffer.toString('utf8').replace(/\s+/gu, ' ').trim().slice(0, 4000);
  }
  if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return `PDF document saved for on-demand extraction: ${filename}`;
  }
  if (mimeType.startsWith('image/')) {
    return `Image saved: ${filename}`;
  }
  if (mimeType.startsWith('audio/') || mimeType.startsWith('voice/')) {
    return `Audio/voice file saved for transcription: ${filename}`;
  }
  return `File saved: ${filename}`;
}

export function insertMediaAsset(db: Database.Database, input: {
  userId: string;
  sourceId: string;
  originalFilename: string;
  vaultPath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  previewText: string;
  metadata?: Record<string, unknown>;
}) {
  const id = `telegram-media:${input.sourceId}`;
  db.prepare(`
    INSERT INTO media_assets (
      id, user_id, source, source_id, original_filename, vault_path, mime_type,
      size_bytes, sha256, preview_text, metadata_json
    ) VALUES (
      @id, @userId, 'telegram', @sourceId, @originalFilename, @vaultPath, @mimeType,
      @sizeBytes, @sha256, @previewText, @metadataJson
    )
    ON CONFLICT(source, source_id) DO UPDATE SET
      original_filename = excluded.original_filename,
      vault_path = excluded.vault_path,
      mime_type = excluded.mime_type,
      size_bytes = excluded.size_bytes,
      sha256 = excluded.sha256,
      preview_text = excluded.preview_text,
      metadata_json = excluded.metadata_json
  `).run({
    id,
    userId: input.userId,
    sourceId: input.sourceId,
    originalFilename: input.originalFilename,
    vaultPath: input.vaultPath,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    sha256: input.sha256,
    previewText: input.previewText,
    metadataJson: JSON.stringify(input.metadata ?? {}),
  });
  return id;
}

export function listRecentMediaAssets(db: Database.Database, userId: string, limit = 10) {
  return db.prepare(`
    SELECT id, source_id, original_filename, vault_path, mime_type, size_bytes, preview_text, created_at, metadata_json
    FROM media_assets
    WHERE user_id = @userId
    ORDER BY created_at DESC
    LIMIT @limit
  `).all({ userId, limit }) as Array<{
    id: string;
    source_id: string;
    original_filename: string | null;
    vault_path: string;
    mime_type: string | null;
    size_bytes: number | null;
    preview_text: string | null;
    created_at: string;
    metadata_json: string;
  }>;
}

export function getMediaAssetByIdOrRecent(db: Database.Database, userId: string, assetId?: string) {
  if (assetId) {
    const exact = db.prepare(`
      SELECT id, source_id, original_filename, vault_path, mime_type, size_bytes, preview_text, created_at, metadata_json
      FROM media_assets
      WHERE user_id = @userId AND (id = @assetId OR source_id = @assetId OR vault_path = @assetId)
      LIMIT 1
    `).get({ userId, assetId }) as any;
    if (exact) return exact;
  }

  return db.prepare(`
    SELECT id, source_id, original_filename, vault_path, mime_type, size_bytes, preview_text, created_at, metadata_json
    FROM media_assets
    WHERE user_id = @userId
    ORDER BY created_at DESC
    LIMIT 1
  `).get({ userId }) as any;
}

export function updateMediaPreview(db: Database.Database, assetId: string, previewText: string) {
  db.prepare('UPDATE media_assets SET preview_text = @previewText WHERE id = @assetId').run({ assetId, previewText });
}

export function writeVaultFile(vaultRoot: string, relativePath: string, buffer: Buffer) {
  if (path.isAbsolute(relativePath)) throw new Error('Media vault path must be relative.');
  const absolutePath = resolvePathWithinRoot(vaultRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, buffer);
  return { absolutePath, vaultPath: path.relative(path.resolve(vaultRoot), absolutePath) };
}
