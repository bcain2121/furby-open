import fs from 'node:fs';
import path from 'node:path';
import { defaultDbPath, openDatabase } from '../db/database.js';

interface UserPreferences {
  model?: string;
  toolMode?: 'safe' | 'coding';
}

interface LegacyPreferencesFile {
  users: Record<string, UserPreferences>;
}

const LEGACY_MIGRATION_KEY = 'migration:preferences-json-v1';

function preferenceKey(userId: number) {
  return `user:${userId}`;
}

function parseUserPreferences(value: unknown): UserPreferences {
  if (!value || typeof value !== 'object') return {};
  const candidate = value as Record<string, unknown>;
  return {
    model: typeof candidate.model === 'string' ? candidate.model : undefined,
    toolMode: candidate.toolMode === 'safe' || candidate.toolMode === 'coding' ? candidate.toolMode : undefined,
  };
}

export class PreferenceStore {
  constructor(
    private readonly legacyFilePath: string,
    private readonly dbPath = defaultDbPath,
  ) {
    this.migrateLegacyPreferences();
  }

  private readLegacy(): LegacyPreferencesFile | undefined {
    try {
      if (!fs.existsSync(this.legacyFilePath)) return undefined;
      const parsed = JSON.parse(fs.readFileSync(this.legacyFilePath, 'utf8')) as unknown;
      if (!parsed || typeof parsed !== 'object' || !(parsed as LegacyPreferencesFile).users) return undefined;
      return parsed as LegacyPreferencesFile;
    } catch {
      return undefined;
    }
  }

  private migrateLegacyPreferences() {
    const legacy = this.readLegacy();
    if (!legacy) return;

    const db = openDatabase(this.dbPath);
    try {
      if (db.prepare('SELECT 1 FROM app_preferences WHERE key = ?').get(LEGACY_MIGRATION_KEY)) return;
      const migrate = db.transaction(() => {
        const insert = db.prepare(`
          INSERT INTO app_preferences (key, value_json, updated_at)
          VALUES (@key, @valueJson, @now)
          ON CONFLICT(key) DO NOTHING
        `);
        const now = new Date().toISOString();
        for (const [userId, value] of Object.entries(legacy.users)) {
          const parsed = parseUserPreferences(value);
          insert.run({ key: `user:${userId}`, valueJson: JSON.stringify(parsed), now });
        }
        insert.run({
          key: LEGACY_MIGRATION_KEY,
          valueJson: JSON.stringify({ source: path.basename(this.legacyFilePath), migratedAt: now }),
          now,
        });
      });
      migrate();
    } finally {
      db.close();
    }
  }

  private getUser(userId: number): UserPreferences {
    const db = openDatabase(this.dbPath);
    try {
      const row = db.prepare('SELECT value_json FROM app_preferences WHERE key = ?').get(preferenceKey(userId)) as { value_json: string } | undefined;
      if (!row) return {};
      try {
        return parseUserPreferences(JSON.parse(row.value_json));
      } catch {
        return {};
      }
    } finally {
      db.close();
    }
  }

  getModel(userId: number): string | undefined {
    return this.getUser(userId).model;
  }

  setModel(userId: number, model: string) {
    this.updateUser(userId, { model });
  }

  getToolMode(userId: number): 'safe' | 'coding' | undefined {
    return this.getUser(userId).toolMode;
  }

  setToolMode(userId: number, toolMode: 'safe' | 'coding') {
    this.updateUser(userId, { toolMode });
  }

  private updateUser(userId: number, patch: UserPreferences) {
    const db = openDatabase(this.dbPath);
    try {
      const update = db.transaction(() => {
        const row = db.prepare('SELECT value_json FROM app_preferences WHERE key = ?').get(preferenceKey(userId)) as { value_json: string } | undefined;
        let current: UserPreferences = {};
        if (row) {
          try {
            current = parseUserPreferences(JSON.parse(row.value_json));
          } catch {
            current = {};
          }
        }
        db.prepare(`
          INSERT INTO app_preferences (key, value_json, updated_at)
          VALUES (@key, @valueJson, @now)
          ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
        `).run({
          key: preferenceKey(userId),
          valueJson: JSON.stringify({ ...current, ...patch }),
          now: new Date().toISOString(),
        });
      });
      update();
    } finally {
      db.close();
    }
  }
}
