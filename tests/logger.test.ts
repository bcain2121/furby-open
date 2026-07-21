import assert from 'node:assert/strict';
import { test } from 'node:test';
import { logEvent } from '../src/observability/logger.js';

test('structured logging redacts sensitive fields', (t) => {
  const records: string[] = [];
  t.mock.method(console, 'log', (message: string) => { records.push(message); });
  logEvent('info', 'test.event', { apiKey: 'secret-value', nested: { token: 'token-value' }, safe: 'visible' });
  const record = JSON.parse(records[0]);
  assert.equal(record.event, 'test.event');
  assert.equal(record.apiKey, '[REDACTED]');
  assert.equal(record.nested.token, '[REDACTED]');
  assert.equal(record.safe, 'visible');
});
