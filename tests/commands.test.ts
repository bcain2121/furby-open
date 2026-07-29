import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTelegramCommandHandler } from '../src/bot/commands.js';

function harness(replyLimit = Number.POSITIVE_INFINITY) {
  const calls = {
    prompts: [] as string[],
    resets: 0,
    accessResets: 0,
    replies: [] as string[],
    model: undefined as string | undefined,
    accessScope: 'project' as 'project' | 'outside',
  };
  const runtime = {
    validateModel: async (model: string) => model,
    reset: async () => { calls.resets += 1; },
    resetAccessScope: async () => { calls.accessResets += 1; },
    prompt: async (_userId: number, text: string) => {
      calls.prompts.push(text);
      return { text: 'prompt response' };
    },
    listSkills: async () => Array.from({ length: 80 }, (_, index) => ({
      name: `skill-${String(index + 1).padStart(2, '0')}`,
      description: `Description ${index + 1} ${'x'.repeat(150)}`,
    })),
  } as any;
  const preferences = {
    getModel: () => calls.model,
    setModel: (_userId: number, model: string) => { calls.model = model; },
    getAccessScope: () => calls.accessScope,
    setAccessScope: (_userId: number, scope: 'project' | 'outside') => { calls.accessScope = scope; },
  } as any;
  const handle = createTelegramCommandHandler(runtime, preferences);
  const execute = (text: string) => handle({
    text,
    userId: 1,
    reply: async (body) => {
      if (body.length > replyLimit) throw new Error(`Telegram message exceeds ${replyLimit} characters`);
      calls.replies.push(body);
    },
    replyFormatted: async (body) => {
      if (body.length > replyLimit) throw new Error(`Telegram message exceeds ${replyLimit} characters`);
      calls.replies.push(body);
    },
    typing: async () => undefined,
  });
  return { calls, execute };
}

test('model command validates, saves, and resets without entering prompt execution', async () => {
  const { calls, execute } = harness();
  await execute('/model minimax3');
  assert.equal(calls.model, 'minimax/MiniMax-M3');
  assert.equal(calls.resets, 1);
  assert.deepEqual(calls.prompts, []);
  assert.match(calls.replies[0], /Model set/u);
});

test('reset command does not enter prompt execution', async () => {
  const { calls, execute } = harness();
  await execute('/reset');
  assert.equal(calls.resets, 1);
  assert.deepEqual(calls.prompts, []);
});

test('outside and project commands change persistent scope natively with warnings and session resets', async () => {
  const { calls, execute } = harness();

  await execute('/outside');
  assert.equal(calls.accessScope, 'outside');
  assert.equal(calls.accessResets, 1);
  assert.match(calls.replies.at(-1) ?? '', /persists across restarts/u);
  assert.match(calls.replies.at(-1) ?? '', /Scheduled tasks/u);
  assert.match(calls.replies.at(-1) ?? '', /\/project/u);
  assert.deepEqual(calls.prompts, []);

  await execute('/access');
  assert.match(calls.replies.at(-1) ?? '', /outside/u);
  assert.equal(calls.accessResets, 1);

  await execute('/project');
  assert.equal(calls.accessScope, 'project');
  assert.equal(calls.accessResets, 2);
  assert.match(calls.replies.at(-1) ?? '', /confined to the Furby Open project/u);
  assert.deepEqual(calls.prompts, []);
});

test('legacy security command gives migration guidance without changing scope', async () => {
  const { calls, execute } = harness();
  await execute('/security coding');
  assert.equal(calls.accessScope, 'project');
  assert.equal(calls.accessResets, 0);
  assert.deepEqual(calls.prompts, []);
  assert.match(calls.replies.at(-1) ?? '', /Security commands changed/u);
  assert.match(calls.replies.at(-1) ?? '', /\/outside/u);
});

test('access command variants are never forwarded to Pi', async () => {
  const { calls, execute } = harness();
  await execute('/outside later');
  await execute('/project maybe');
  await execute('/access outside');
  assert.deepEqual(calls.prompts, []);
  assert.equal(calls.accessScope, 'project');
});

test('unknown command is deliberately forwarded to Pi', async () => {
  const { calls, execute } = harness();
  await execute('/skill:example hello');
  assert.deepEqual(calls.prompts, ['/skill:example hello']);
  assert.equal(calls.replies.at(-1), 'prompt response');
});

test('skills command paginates output below Telegram message limits', async () => {
  const { calls, execute } = harness(4_096);
  await execute('/skills');
  assert.ok(calls.replies.length > 1);
  assert.ok(calls.replies.every((reply) => reply.length <= 4_096));
  assert.match(calls.replies.join('\n'), /skill-01/u);
  assert.match(calls.replies.join('\n'), /skill-80/u);
});
