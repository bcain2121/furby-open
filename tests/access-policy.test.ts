import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  accessScopeSummary,
  createProjectAccessPolicy,
  effectiveAccessToolNames,
} from '../src/runtime/access-policy.js';

test('access scope selects purpose-specific tools without allowing A2A to inherit owner access', () => {
  const furbyTools = ['furby_memory_save', 'furby_schedule_create'];

  assert.deepEqual(effectiveAccessToolNames('project', 'interactive', ['read', 'edit', 'write', ...furbyTools]), {
    builtIn: [],
    custom: ['read', 'edit', 'write', ...furbyTools],
  });
  assert.deepEqual(effectiveAccessToolNames('outside', 'scheduled', furbyTools), {
    builtIn: ['read', 'bash', 'edit', 'write'],
    custom: furbyTools,
  });
  assert.deepEqual(effectiveAccessToolNames('outside', 'a2a', ['write_a2a_response', 'list_a2a_pending', ...furbyTools]), {
    builtIn: [],
    custom: ['write_a2a_response', 'list_a2a_pending'],
  });
  assert.match(accessScopeSummary('project'), /confined to the Furby Open project/u);
  assert.match(accessScopeSummary('outside'), /host shell/u);
});

test('project access resolves files inside the canonical root and rejects paths outside it', async (t) => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'furby-access-policy-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));

  const projectRoot = path.join(parent, 'project');
  const projectFile = path.join(projectRoot, 'notes.txt');
  const outsideFile = path.join(parent, 'outside.txt');
  await fs.mkdir(projectRoot);
  await fs.writeFile(projectFile, 'inside');
  await fs.writeFile(outsideFile, 'outside');

  const policy = await createProjectAccessPolicy(projectRoot);

  assert.equal(await policy.resolvePath(projectFile, 'read'), projectFile);
  await assert.rejects(policy.resolvePath(outsideFile, 'read'), /outside the Furby Open project/u);
  await assert.rejects(policy.resolvePath(path.join(projectRoot, '..', 'outside.txt'), 'write'), /outside the Furby Open project/u);
});

test('project access applies explicit configuration and protected-path rules', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'furby-access-internal-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));

  await fs.mkdir(path.join(projectRoot, '.data'));
  await fs.mkdir(path.join(projectRoot, '.git'));
  await fs.writeFile(path.join(projectRoot, '.env'), 'SECRET=local');
  await fs.writeFile(path.join(projectRoot, '.data', 'personality.md'), 'Be direct.');
  await fs.writeFile(path.join(projectRoot, '.data', 'furby-open.db'), 'database');
  await fs.writeFile(path.join(projectRoot, '.git', 'config'), '[core]');
  await fs.writeFile(path.join(projectRoot, 'private-key.pem'), 'private');

  const policy = await createProjectAccessPolicy(projectRoot);

  assert.equal(await policy.resolvePath('.env', 'read'), path.join(projectRoot, '.env'));
  assert.equal(await policy.resolvePath('.env', 'write'), path.join(projectRoot, '.env'));
  assert.equal(await policy.resolvePath('.data/personality.md', 'write'), path.join(projectRoot, '.data', 'personality.md'));
  await assert.rejects(policy.resolvePath('.data/furby-open.db', 'read'), /protected project path/u);
  await assert.rejects(policy.resolvePath('private-key.pem', 'read'), /protected project path/u);
  assert.equal(await policy.resolvePath('.git/config', 'read'), path.join(projectRoot, '.git', 'config'));
  await assert.rejects(policy.resolvePath('.git/config', 'write'), /read-only project path/u);
});

test('project access rejects existing and nearest-ancestor symlink escapes', async (t) => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'furby-access-symlink-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));

  const projectRoot = path.join(parent, 'project');
  const outsideRoot = path.join(parent, 'outside');
  await fs.mkdir(projectRoot);
  await fs.mkdir(outsideRoot);
  await fs.writeFile(path.join(outsideRoot, 'secret.txt'), 'secret');
  await fs.symlink(outsideRoot, path.join(projectRoot, 'escape'));

  const policy = await createProjectAccessPolicy(projectRoot);

  await assert.rejects(policy.resolvePath(path.join(projectRoot, 'escape', 'secret.txt'), 'read'), /outside the Furby Open project/u);
  await assert.rejects(policy.resolvePath(path.join(projectRoot, 'escape', 'new.txt'), 'write'), /outside the Furby Open project/u);
});
