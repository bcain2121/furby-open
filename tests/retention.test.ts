import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { applyRetentionCandidates, collectRetentionCandidates } from '../src/operations/retention.js';

test('retention cleanup is reviewable before files are removed', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'furby-retention-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const oldLog = path.join(root, 'logs', 'old.log');
  const recentLog = path.join(root, 'logs', 'recent.log');
  fs.mkdirSync(path.dirname(oldLog), { recursive: true });
  fs.writeFileSync(oldLog, 'old');
  fs.writeFileSync(recentLog, 'recent');
  const oldDate = new Date('2026-01-01T00:00:00.000Z');
  fs.utimesSync(oldLog, oldDate, oldDate);

  const candidates = await collectRetentionCandidates(root, new Date('2026-07-09T00:00:00.000Z'));
  assert.deepEqual(candidates.map((candidate) => path.basename(candidate.path)), ['old.log']);
  assert.equal(fs.existsSync(oldLog), true, 'collection must remain a dry run');

  await applyRetentionCandidates(candidates);
  assert.equal(fs.existsSync(oldLog), false);
  assert.equal(fs.existsSync(recentLog), true);
});
