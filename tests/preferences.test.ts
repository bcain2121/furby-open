import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PreferenceStore } from '../src/storage/preferences.js';

test('preference store migrates legacy JSON and persists updates in SQLite', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'furby-preferences-'));
  const legacyPath = path.join(root, 'preferences.json');
  const dbPath = path.join(root, 'furby.db');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(legacyPath, JSON.stringify({
    users: {
      '42': { model: 'minimax/MiniMax-M3', toolMode: 'safe' },
    },
  }));

  const preferences = new PreferenceStore(legacyPath, dbPath);
  assert.equal(preferences.getModel(42), 'minimax/MiniMax-M3');
  assert.equal(preferences.getToolMode(42), 'safe');

  preferences.setModel(42, 'openai-codex/gpt-5.6-sol');
  preferences.setToolMode(42, 'coding');

  const restarted = new PreferenceStore(legacyPath, dbPath);
  assert.equal(restarted.getModel(42), 'openai-codex/gpt-5.6-sol');
  assert.equal(restarted.getToolMode(42), 'coding');
});

test('corrupt legacy preference JSON does not erase SQLite preferences', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'furby-preferences-'));
  const legacyPath = path.join(root, 'preferences.json');
  const dbPath = path.join(root, 'furby.db');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const preferences = new PreferenceStore(legacyPath, dbPath);
  preferences.setModel(7, 'minimax/MiniMax-M3');
  fs.writeFileSync(legacyPath, '{broken');

  const restarted = new PreferenceStore(legacyPath, dbPath);
  assert.equal(restarted.getModel(7), 'minimax/MiniMax-M3');
});
