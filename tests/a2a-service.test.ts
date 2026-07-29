import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { FurbyA2AService } from '../src/a2a/service.js';
import { A2ATaskStore } from '../src/a2a/store.js';

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'furby-a2a-'));
}

async function waitForCompleted(baseUrl: string, taskId: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'poll', method: 'tasks/get', params: { taskId } }),
    });
    const payload = await response.json() as any;
    if (payload.result?.status === 'completed' || payload.result?.status === 'failed') return payload.result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Task ${taskId} did not complete`);
}

function options(taskDir: string) {
  return {
    hostname: '127.0.0.1',
    port: 0,
    taskDir,
    userId: 123,
    modelName: 'test/model',
    maxConcurrency: 2,
    agentName: 'Test Furby',
    skills: ['a2a'],
  };
}

test('A2A service has one listener and completes standard JSON-RPC tasks in an isolated purpose', async (t) => {
  const root = temporaryDirectory();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls: any[][] = [];
  const runtime = {
    prompt: async (...args: any[]) => {
      calls.push(args);
      return { text: 'network answer' };
    },
    abortPurpose: async () => undefined,
  };
  const service = new FurbyA2AService(runtime, options(root));
  await service.start();
  t.after(() => service.stop());
  const firstPort = service.address!.port;
  await service.start();
  assert.equal(service.address!.port, firstPort);
  const baseUrl = `http://127.0.0.1:${firstPort}`;

  const card = await fetch(baseUrl).then((response) => response.json()) as any;
  assert.equal(card.name, 'Test Furby');
  assert.ok(card.capabilities.skills.includes('a2a'));
  assert.deepEqual(card.capabilities.tools, ['write_a2a_response', 'list_a2a_pending']);

  const sent = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'send', method: 'tasks/send',
      params: { taskId: 'standard-task-1', threadId: 'thread-1', message: { role: 'user', parts: [{ type: 'text', text: 'hello Furby' }] } },
    }),
  }).then((response) => response.json()) as any;
  assert.equal(sent.result.taskId, 'standard-task-1');
  const completed = await waitForCompleted(baseUrl, 'standard-task-1');
  assert.equal(completed.status, 'completed');
  assert.equal(completed.result, 'network answer');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][3], 'project');
  assert.equal(calls[0][5], 'a2a');
  assert.match(calls[0][1], /\[A2A:standard-task-1\]/u);

  const streamText = await fetch(`${baseUrl}/tasks/standard-task-1/stream`).then((response) => response.text());
  assert.match(streamText, /"status":"completed"/u);

  await service.stop();
  assert.equal(service.running, false);
});

test('A2A service rejects invalid requests and oversized bodies', async (t) => {
  const root = temporaryDirectory();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runtime = { prompt: async () => ({ text: 'unused' }), abortPurpose: async () => undefined };
  const service = new FurbyA2AService(runtime, { ...options(root), maxBodyBytes: 256 });
  await service.start();
  t.after(() => service.stop());
  const baseUrl = `http://127.0.0.1:${service.address!.port}`;

  const invalid = await fetch(baseUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tasks/get', params: { taskId: '../bad' } }),
  }).then((response) => response.json()) as any;
  assert.equal(invalid.error.code, -32602);

  const oversizedResponse = await fetch(baseUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(300),
  });
  assert.equal(oversizedResponse.status, 413);
});

test('A2A service resumes persisted pending tasks after restart', async (t) => {
  const root = temporaryDirectory();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new A2ATaskStore(root);
  store.create({
    id: 'recovered-task', status: 'pending', createdAt: Date.now(),
    message: { role: 'user', parts: [{ type: 'text', text: 'resume me' }] },
  });
  const runtime = { prompt: async () => ({ text: 'recovered answer' }), abortPurpose: async () => undefined };
  const service = new FurbyA2AService(runtime, options(root));
  await service.start();
  t.after(() => service.stop());
  const completed = await waitForCompleted(`http://127.0.0.1:${service.address!.port}`, 'recovered-task');
  assert.equal(completed.result, 'recovered answer');
});
