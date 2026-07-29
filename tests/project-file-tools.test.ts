import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProjectFileTools } from '../src/runtime/project-file-tools.js';

function toolByName(tools: Awaited<ReturnType<typeof createProjectFileTools>>, name: string) {
  const tool = tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `missing ${name} tool`);
  return tool;
}

async function execute(tool: ReturnType<typeof toolByName>, input: unknown) {
  return tool.execute('test-call', input as never, undefined, undefined, {} as never);
}

test('project file tools reject reads and writes above the configured size bound', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'furby-bounded-tools-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));

  await fs.writeFile(path.join(projectRoot, 'large.txt'), '12345');
  const tools = await createProjectFileTools(projectRoot, { maxBytes: 4 });

  await assert.rejects(execute(toolByName(tools, 'read'), { path: 'large.txt' }), /project file limit/u);
  await assert.rejects(execute(toolByName(tools, 'write'), { path: 'new.txt', content: '12345' }), /project file limit/u);
  await assert.rejects(fs.access(path.join(projectRoot, 'new.txt')));
});

test('project file tools enforce protected paths through every operation', async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'furby-protected-tools-'));
  t.after(() => fs.rm(projectRoot, { recursive: true, force: true }));

  await fs.mkdir(path.join(projectRoot, '.data'));
  await fs.writeFile(path.join(projectRoot, '.data', 'furby-open.db'), 'database');
  const tools = await createProjectFileTools(projectRoot);

  await assert.rejects(execute(toolByName(tools, 'read'), { path: '.data/furby-open.db' }), /protected project path/u);
  await assert.rejects(execute(toolByName(tools, 'edit'), {
    path: '.data/furby-open.db',
    edits: [{ oldText: 'database', newText: 'changed' }],
  }), /protected project path/u);
  await assert.rejects(execute(toolByName(tools, 'write'), {
    path: '.data/furby-open.db',
    content: 'changed',
  }), /protected project path/u);
  assert.equal(await fs.readFile(path.join(projectRoot, '.data', 'furby-open.db'), 'utf8'), 'database');
});

test('project file tools read, edit, and write inside the root while rejecting outside paths', async (t) => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'furby-project-tools-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));

  const projectRoot = path.join(parent, 'project');
  const outsideFile = path.join(parent, 'outside.txt');
  await fs.mkdir(projectRoot);
  await fs.writeFile(path.join(projectRoot, '.env'), 'NAME=Furby\n');
  await fs.writeFile(outsideFile, 'outside');

  const tools = await createProjectFileTools(projectRoot);
  assert.deepEqual(tools.map((tool) => tool.name), ['read', 'edit', 'write']);

  const readResult = await execute(toolByName(tools, 'read'), { path: '.env' });
  assert.match(readResult.content[0]?.type === 'text' ? readResult.content[0].text : '', /NAME=Furby/u);

  await execute(toolByName(tools, 'edit'), {
    path: '.env',
    edits: [{ oldText: 'NAME=Furby', newText: 'NAME=Open Furby' }],
  });
  await execute(toolByName(tools, 'write'), { path: 'notes/new.txt', content: 'created' });

  assert.equal(await fs.readFile(path.join(projectRoot, '.env'), 'utf8'), 'NAME=Open Furby\n');
  assert.equal(await fs.readFile(path.join(projectRoot, 'notes', 'new.txt'), 'utf8'), 'created');
  await assert.rejects(execute(toolByName(tools, 'write'), { path: outsideFile, content: 'changed' }), /outside the Furby Open project/u);
  assert.equal(await fs.readFile(outsideFile, 'utf8'), 'outside');
});
