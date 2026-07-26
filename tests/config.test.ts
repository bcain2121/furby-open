import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLoopbackHostname, isValidTimeZone } from '../src/config/env.js';
import { formatTaskTime } from '../src/scheduler/parse.js';

test('runtime policy accepts valid timezones and only loopback A2A hosts', () => {
  assert.equal(isValidTimeZone('America/New_York'), true);
  assert.equal(isValidTimeZone('not/a-timezone'), false);
  assert.equal(isLoopbackHostname('127.0.0.1'), true);
  assert.equal(isLoopbackHostname('LOCALHOST'), true);
  assert.equal(isLoopbackHostname('0.0.0.0'), false);
});

test('scheduled task display uses the configured timezone', () => {
  const iso = '2026-01-15T12:00:00.000Z';
  assert.notEqual(formatTaskTime(iso, 'UTC'), formatTaskTime(iso, 'America/Los_Angeles'));
});
