import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { initializeSchema } from '../src/db/schema.js';
import { formatMemoryContext, saveMemory, searchConversationMessages, searchMemories } from '../src/db/memory.js';

test('memory save/search and context formatting works', () => {
  const db = new Database(':memory:');
  initializeSchema(db);
  db.prepare("INSERT INTO users (id, display_name) VALUES ('telegram:1', 'Test')").run();

  const id = saveMemory(db, {
    userId: 'telegram:1',
    content: 'The user likes purple notebooks for planning projects.',
    tags: ['preferences'],
    importanceScore: 8,
  });

  const rows = searchMemories(db, 'telegram:1', 'purple notebooks', 5);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, id);
  assert.match(formatMemoryContext(rows), /purple notebooks/u);
  db.close();
});

test('conversation search finds indexed messages', () => {
  const db = new Database(':memory:');
  initializeSchema(db);
  db.prepare("INSERT INTO users (id, display_name) VALUES ('telegram:1', 'Test')").run();
  db.prepare("INSERT INTO conversation_threads (id, user_id, source, source_id) VALUES ('thread:1', 'telegram:1', 'test', 'thread:1')").run();
  db.prepare("INSERT INTO conversation_messages (id, thread_id, user_id, role, content, source, source_table, source_id) VALUES ('msg:1', 'thread:1', 'telegram:1', 'user', 'The secret project codename is blueberry.', 'test', 'messages', 'msg:1')").run();

  const rows = searchConversationMessages(db, 'telegram:1', 'blueberry', 5);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].content, 'The secret project codename is blueberry.');
  db.close();
});
