import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config/env.js';
import { initializeSchema } from './schema.js';

export const defaultDbPath = path.join(config.rootDir, '.data', 'furby-open.db');

export function openDatabase(dbPath = defaultDbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  initializeSchema(db);
  return db;
}

export function appUserIdForTelegram(telegramUserId: number) {
  return `telegram:${telegramUserId}`;
}

export function ensureTelegramUser(db: Database.Database, telegramUserId: number, displayName = 'Telegram User') {
  const userId = appUserIdForTelegram(telegramUserId);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO users (id, display_name, created_at, updated_at, metadata_json)
    VALUES (@id, @displayName, @now, @now, '{}')
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      updated_at = excluded.updated_at
  `).run({ id: userId, displayName, now });

  db.prepare(`
    INSERT INTO user_identities (id, user_id, provider, external_id, created_at, metadata_json)
    VALUES (@id, @userId, 'telegram', @externalId, @now, '{}')
    ON CONFLICT(provider, external_id) DO UPDATE SET user_id = excluded.user_id
  `).run({ id: `telegram:${telegramUserId}`, userId, externalId: String(telegramUserId), now });

  return userId;
}
