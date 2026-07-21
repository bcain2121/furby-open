import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTelegramCommandHandler } from '../src/bot/commands.js';

function harness(replyLimit = Number.POSITIVE_INFINITY) {
  const calls = { prompts: [] as string[], resets: 0, replies: [] as string[], model: undefined as string | undefined };
  const runtime = {
    validateModel: async (model: string) => model,
    reset: async () => { calls.resets += 1; },
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
    getToolMode: () => 'coding',
    setToolMode: () => undefined,
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
