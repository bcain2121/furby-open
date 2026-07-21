import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertReadOnlySql } from '../src/runtime/db-tools.js';

test('read-only database validation accepts query statements', () => {
  assert.doesNotThrow(() => assertReadOnlySql('SELECT id, content FROM memories LIMIT 5'));
  assert.doesNotThrow(() => assertReadOnlySql('WITH recent AS (SELECT id FROM memories) SELECT * FROM recent'));
  assert.doesNotThrow(() => assertReadOnlySql('EXPLAIN QUERY PLAN SELECT * FROM memories'));
});

test('read-only database validation rejects mutation and PRAGMA statements', () => {
  for (const sql of [
    'PRAGMA journal_mode=DELETE',
    'PRAGMA writable_schema=ON',
    'UPDATE memories SET content = \'changed\'',
    'WITH doomed AS (SELECT id FROM memories) DELETE FROM memories',
    'SELECT 1; DROP TABLE memories',
  ]) {
    assert.throws(() => assertReadOnlySql(sql), `Expected rejection for: ${sql}`);
  }
});
