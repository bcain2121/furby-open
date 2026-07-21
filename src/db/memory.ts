import type Database from 'better-sqlite3';
import crypto from 'node:crypto';

function jsonArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function memoryMatchQuery(query: string) {
  const terms = query
    .split(/\s+/u)
    .map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, '').trim())
    .filter((term) => term.length >= 2)
    .slice(0, 8);
  return terms.map((term) => `"${term}"`).join(' OR ');
}

export function saveMemory(db: Database.Database, input: {
  userId: string;
  content: string;
  tags?: string[] | string;
  importanceScore?: number;
  metadata?: Record<string, unknown>;
}) {
  const id = `memory:${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO memories (
      id, user_id, content, tags_json, importance_score, source, created_at, updated_at, metadata_json, embedding_status
    ) VALUES (
      @id, @userId, @content, @tagsJson, @importanceScore, 'furby-open', @now, @now, @metadataJson, 'pending'
    )
  `).run({
    id,
    userId: input.userId,
    content: input.content,
    tagsJson: JSON.stringify(jsonArray(input.tags)),
    importanceScore: input.importanceScore ?? 5,
    now,
    metadataJson: JSON.stringify(input.metadata ?? {}),
  });
  return id;
}

export function searchMemories(db: Database.Database, userId: string, query: string, limit = 5) {
  const match = memoryMatchQuery(query);
  if (!match) return [];
  return db.prepare(`
    SELECT m.id, m.content, m.tags_json, m.importance_score, m.original_created_at, m.created_at, m.source
    FROM memories_fts f
    JOIN memories m ON m.rowid = f.rowid
    WHERE memories_fts MATCH @match AND m.user_id = @userId
    ORDER BY rank, m.importance_score DESC
    LIMIT @limit
  `).all({ match, userId, limit }) as Array<{
    id: string;
    content: string;
    tags_json: string;
    importance_score: number;
    original_created_at: string | null;
    created_at: string;
    source: string;
  }>;
}

export function searchConversationMessages(db: Database.Database, userId: string, query: string, limit = 10) {
  const match = memoryMatchQuery(query);
  if (!match) return [];
  return db.prepare(`
    SELECT cm.id, cm.thread_id, cm.role, cm.content, cm.original_created_at, cm.created_at, cm.source
    FROM conversation_messages_fts f
    JOIN conversation_messages cm ON cm.rowid = f.rowid
    WHERE conversation_messages_fts MATCH @match AND cm.user_id = @userId
    ORDER BY rank
    LIMIT @limit
  `).all({ match, userId, limit }) as Array<{
    id: string;
    thread_id: string;
    role: string;
    content: string;
    original_created_at: string | null;
    created_at: string;
    source: string;
  }>;
}

export function formatMemoryContext(memories: Array<{ content: string; source: string; original_created_at: string | null; created_at: string }>) {
  if (memories.length === 0) return '';
  return [
    'Relevant assistant memory context:',
    ...memories.map((memory, index) => {
      const date = memory.original_created_at ?? memory.created_at;
      return `${index + 1}. (${memory.source}, ${date}) ${memory.content}`;
    }),
  ].join('\n');
}
