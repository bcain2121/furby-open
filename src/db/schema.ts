import type Database from 'better-sqlite3';

function hasColumn(db: Database.Database, table: string, column: string) {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  return columns.some((candidate) => candidate.name === column);
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, definition: string) {
  if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export function initializeSchema(db: Database.Database) {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const baselineApplied = db.prepare('SELECT 1 FROM schema_migrations WHERE version = 1').get();
  if (!baselineApplied) {
    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS user_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      external_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      UNIQUE(provider, external_id)
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      importance_score INTEGER NOT NULL DEFAULT 5,
      source TEXT NOT NULL DEFAULT 'furby-open',
      source_table TEXT,
      source_id TEXT,
      original_created_at TEXT,
      imported_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      embedding_status TEXT NOT NULL DEFAULT 'pending',
      embedding_provider TEXT,
      embedding_model TEXT,
      embedding_updated_at TEXT,
      UNIQUE(source, source_table, source_id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      tags,
      content='memories',
      content_rowid='rowid'
    );

    CREATE TABLE IF NOT EXISTS conversation_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT,
      source TEXT NOT NULL DEFAULT 'furby-open',
      source_id TEXT,
      started_at TEXT,
      ended_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      UNIQUE(source, source_id)
    );

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      source TEXT NOT NULL DEFAULT 'furby-open',
      source_table TEXT,
      source_id TEXT,
      original_created_at TEXT,
      imported_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      UNIQUE(source, source_table, source_id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS conversation_messages_fts USING fts5(
      content,
      role,
      content='conversation_messages',
      content_rowid='rowid'
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      source TEXT NOT NULL DEFAULT 'furby-open',
      source_id TEXT,
      original_filename TEXT,
      vault_path TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      sha256 TEXT,
      preview_text TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      UNIQUE(source, source_id)
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      telegram_chat_id INTEGER NOT NULL,
      title TEXT,
      prompt TEXT NOT NULL,
      schedule_kind TEXT NOT NULL,
      interval_seconds INTEGER,
      run_at TEXT,
      next_run_at TEXT NOT NULL,
      last_run_at TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      run_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS scheduled_task_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      output_text TEXT,
      error_text TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS app_preferences (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS import_runs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      summary_json TEXT NOT NULL DEFAULT '{}',
      report_path TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON conversation_messages(thread_id, original_created_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_user ON conversation_messages(user_id, original_created_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_due ON scheduled_tasks(enabled, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_user ON scheduled_tasks(user_id, enabled, next_run_at);
  `);

    db.exec(`
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags_json);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES('delete', old.rowid, old.content, old.tags_json);
    END;
    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES('delete', old.rowid, old.content, old.tags_json);
      INSERT INTO memories_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags_json);
    END;

    CREATE TRIGGER IF NOT EXISTS conversation_messages_ai AFTER INSERT ON conversation_messages BEGIN
      INSERT INTO conversation_messages_fts(rowid, content, role) VALUES (new.rowid, new.content, new.role);
    END;
    CREATE TRIGGER IF NOT EXISTS conversation_messages_ad AFTER DELETE ON conversation_messages BEGIN
      INSERT INTO conversation_messages_fts(conversation_messages_fts, rowid, content, role) VALUES('delete', old.rowid, old.content, old.role);
    END;
    CREATE TRIGGER IF NOT EXISTS conversation_messages_au AFTER UPDATE ON conversation_messages BEGIN
      INSERT INTO conversation_messages_fts(conversation_messages_fts, rowid, content, role) VALUES('delete', old.rowid, old.content, old.role);
      INSERT INTO conversation_messages_fts(rowid, content, role) VALUES (new.rowid, new.content, new.role);
    END;
  `);
    db.prepare('INSERT INTO schema_migrations (version) VALUES (1)').run();
  }

  const schedulerClaimsApplied = db.prepare('SELECT 1 FROM schema_migrations WHERE version = 2').get();
  if (!schedulerClaimsApplied) {
    const migrate = db.transaction(() => {
      addColumnIfMissing(db, 'scheduled_tasks', 'claim_token', 'TEXT');
      addColumnIfMissing(db, 'scheduled_tasks', 'claim_expires_at', 'TEXT');
      addColumnIfMissing(db, 'scheduled_tasks', 'failure_count', 'INTEGER NOT NULL DEFAULT 0');
      addColumnIfMissing(db, 'scheduled_tasks', 'last_error', 'TEXT');
      addColumnIfMissing(db, 'scheduled_task_runs', 'claim_token', 'TEXT');
      addColumnIfMissing(db, 'scheduled_task_runs', 'delivery_status', "TEXT NOT NULL DEFAULT 'pending'");
      addColumnIfMissing(db, 'scheduled_task_runs', 'delivery_error', 'TEXT');
      db.exec('CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_claim ON scheduled_tasks(enabled, next_run_at, claim_expires_at)');
      db.prepare('INSERT INTO schema_migrations (version) VALUES (2)').run();
    });
    migrate();
  }
}
