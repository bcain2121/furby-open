import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const updateScript = path.join(process.cwd(), 'scripts', 'update.sh');

test('safe updater has valid shell syntax and preserves update guardrails', () => {
  const syntax = spawnSync('bash', ['-n', updateScript], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
  const source = fs.readFileSync(updateScript, 'utf8');
  assert.match(source, /git status --porcelain/u);
  assert.match(source, /git merge-base --is-ancestor/u);
  assert.match(source, /git worktree add --detach/u);
  assert.match(source, /tar -czf/u);
  assert.match(source, /git merge --ff-only/u);
  assert.match(source, /npm ci/u);
  assert.match(source, /npm run build/u);
  assert.match(source, /npm test/u);
  assert.match(source, /npm run doctor/u);
});
