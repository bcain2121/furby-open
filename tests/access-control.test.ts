import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { AccessControl } from '../src/runtime/access-control.js';
import { PreferenceStore } from '../src/storage/preferences.js';

function temporaryPreferences(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'furby-access-control-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    legacyPath: path.join(root, 'preferences.json'),
    dbPath: path.join(root, 'furby.db'),
  };
}

test('outside access activates immediately, persists, and includes project recovery instructions', (t) => {
  const paths = temporaryPreferences(t);
  const preferences = new PreferenceStore(paths.legacyPath, paths.dbPath);
  const access = new AccessControl(preferences);

  assert.equal(access.status(42).scope, 'project');
  const activated = access.activateOutside(42);
  assert.equal(activated.scope, 'outside');
  assert.equal(activated.changed, true);
  assert.equal(activated.resetSessions, true);
  assert.match(activated.message, /persists across restarts/u);
  assert.match(activated.message, /Scheduled tasks/u);
  assert.match(activated.message, /\/project/u);

  const restarted = new AccessControl(new PreferenceStore(paths.legacyPath, paths.dbPath));
  assert.equal(restarted.status(42).scope, 'outside');
});

test('project access revokes outside access immediately and repeated transitions are idempotent', (t) => {
  const paths = temporaryPreferences(t);
  const access = new AccessControl(new PreferenceStore(paths.legacyPath, paths.dbPath));
  access.activateOutside(7);

  const revoked = access.activateProject(7);
  assert.deepEqual({ scope: revoked.scope, changed: revoked.changed, resetSessions: revoked.resetSessions }, {
    scope: 'project', changed: true, resetSessions: true,
  });
  assert.match(revoked.message, /confined to the Furby Open project/u);

  const repeated = access.activateProject(7);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.resetSessions, false);
});
