import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { resolveVaultPath } from '../src/runtime/vault-tools.js';
import { resolvePathWithinRoot } from '../src/storage/vault-path.js';

test('resolveVaultPath rejects path traversal outside the workspace', () => {
  assert.throws(() => resolveVaultPath('../secrets.txt'), /escapes the configured workspace/u);
});

test('resolveVaultPath accepts normal relative vault paths', () => {
  const resolved = resolveVaultPath('notes/test.md');
  assert.match(resolved, /furby-open-workspace\/notes\/test\.md$/u);
});

test('vault path validation rejects absolute paths outside the vault', () => {
  assert.throws(() => resolveVaultPath('/etc/passwd'), /escapes the configured workspace/u);
});

test('vault path validation rejects symbolic-link escapes', (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'furby-vault-test-'));
  const vaultRoot = path.join(temporaryRoot, 'vault');
  const outsideRoot = path.join(temporaryRoot, 'outside');
  fs.mkdirSync(vaultRoot);
  fs.mkdirSync(outsideRoot);
  fs.symlinkSync(outsideRoot, path.join(vaultRoot, 'escape'));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));

  assert.throws(
    () => resolvePathWithinRoot(vaultRoot, 'escape/secret.txt'),
    /symbolic link/u,
  );
});
