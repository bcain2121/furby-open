import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { SettingsManager } from '@earendil-works/pi-coding-agent';
import { config } from '../src/config/env.js';
import {
  FURBY_SESSION_SETTINGS,
  createFurbyCustomTools,
  createFurbySessionToolConfiguration,
} from '../src/runtime/pi-session.js';
import {
  FURBY_EXCLUDED_GLOBAL_EXTENSIONS,
  FURBY_RESOURCE_POLICY,
  createFurbyResourceLoader,
  loadedExtensionPaths,
} from '../src/runtime/resource-policy.js';

test('Furby Open isolates project skills and excludes global extension lifecycles by default', async () => {
  const loader = createFurbyResourceLoader({
    cwd: config.rootDir,
    agentDir: config.piAgentDir,
    purpose: 'interactive',
    systemPrompt: 'test',
    loadGlobalSkills: false,
  });
  await loader.reload();
  const skills = loader.getSkills();
  const names = skills.skills.map((skill) => skill.name);
  assert.ok(names.includes('assistant-customizer'));
  assert.ok(names.includes('skill-builder'));
  assert.ok(skills.skills.every((skill) => path.resolve(skill.filePath).startsWith(`${path.resolve(config.rootDir)}${path.sep}`)));
  assert.deepEqual(loadedExtensionPaths(loader), []);
  assert.equal(FURBY_RESOURCE_POLICY.loadGlobalExtensions, false);
  assert.equal(FURBY_RESOURCE_POLICY.defaultLoadGlobalSkills, false);
  assert.ok(FURBY_EXCLUDED_GLOBAL_EXTENSIONS.includes('scheduler'));
  assert.ok(FURBY_EXCLUDED_GLOBAL_EXTENSIONS.includes('a2a-protocol'));
});

test('Furby session settings explicitly deliver all steering and follow-up messages', () => {
  const manager = SettingsManager.inMemory(FURBY_SESSION_SETTINGS);
  assert.equal(manager.getSteeringMode(), 'all');
  assert.equal(manager.getFollowUpMode(), 'all');
  assert.equal(manager.getGlobalSettings().compaction?.enabled, false);
  assert.equal(manager.getGlobalSettings().retry?.maxRetries, 1);
});

test('runtime tool assembly uses confined project tools, unrestricted outside built-ins, and isolated A2A tools', async () => {
  const project = await createFurbySessionToolConfiguration(123, 'interactive', 'project');
  assert.deepEqual(project.effectiveTools.builtIn, []);
  assert.ok(project.effectiveTools.custom.includes('read'));
  assert.ok(project.effectiveTools.custom.includes('edit'));
  assert.ok(project.effectiveTools.custom.includes('write'));
  assert.ok(!project.effectiveTools.custom.includes('bash'));
  assert.ok(project.effectiveTools.custom.includes('furby_memory_save'));

  const outside = await createFurbySessionToolConfiguration(123, 'scheduled', 'outside');
  assert.deepEqual(outside.effectiveTools.builtIn, ['read', 'bash', 'edit', 'write']);
  assert.ok(outside.effectiveTools.custom.includes('furby_memory_save'));
  assert.equal(outside.customTools.some((tool: any) => ['read', 'edit', 'write'].includes(String(tool.name))), false);

  const a2a = await createFurbySessionToolConfiguration(123, 'a2a', 'outside');
  assert.deepEqual(a2a.effectiveTools, {
    builtIn: [],
    custom: ['write_a2a_response', 'list_a2a_pending'],
  });
});

test('A2A response tools exist only in A2A sessions and Telegram sends are excluded there', () => {
  const names = (purpose: 'interactive' | 'scheduled' | 'a2a') => (
    createFurbyCustomTools(123, purpose).map((tool: any) => String(tool.name))
  );
  assert.deepEqual(names('a2a'), ['write_a2a_response', 'list_a2a_pending']);
  assert.ok(!names('interactive').includes('write_a2a_response'));
  assert.ok(!names('scheduled').includes('write_a2a_response'));
  assert.ok(!names('a2a').some((name) => name.includes('telegram')));
});

test('resource policy source does not reference the global Scheduler socket', async () => {
  const source = await import('node:fs/promises').then((fs) => fs.readFile(
    path.join(config.rootDir, 'src', 'runtime', 'resource-policy.ts'),
    'utf8',
  ));
  assert.doesNotMatch(source, /pi-scheduler\.sock/u);
});
