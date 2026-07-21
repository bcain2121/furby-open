import assert from 'node:assert/strict';
import { test } from 'node:test';
import { envValue, setEnvValues } from '../src/setup/env-file.js';

test('reads and updates targeted env values without exposing or replacing other values', () => {
  const original = 'ASSISTANT_NAME=Nova\nTELEGRAM_BOT_TOKEN=secret-token\nTELEGRAM_USER_ID=\n';
  const updated = setEnvValues(original, {
    TELEGRAM_BOT_TOKEN: 'replacement-token',
    TELEGRAM_USER_ID: 12345,
  });
  assert.equal(envValue(updated, 'ASSISTANT_NAME'), 'Nova');
  assert.equal(envValue(updated, 'TELEGRAM_BOT_TOKEN'), 'replacement-token');
  assert.equal(envValue(updated, 'TELEGRAM_USER_ID'), '12345');
});

test('appends missing env values and rejects line injection', () => {
  assert.match(setEnvValues('ASSISTANT_NAME=Nova\n', { TELEGRAM_USER_ID: 42 }), /TELEGRAM_USER_ID=42/u);
  assert.throws(
    () => setEnvValues('A=1\n', { TELEGRAM_BOT_TOKEN: 'token\nMALICIOUS=yes' }),
    /Invalid environment value/u,
  );
});
