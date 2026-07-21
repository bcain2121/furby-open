import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InteractionQueue } from '../src/runtime/interaction-queue.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test('same-user interactions execute in submission order without overlap', async () => {
  const queue = new InteractionQueue<number>();
  const gate = deferred();
  const events: string[] = [];

  const first = queue.run(1, async () => {
    events.push('first:start');
    await gate.promise;
    events.push('first:end');
  });
  const second = queue.run(1, async () => {
    events.push('second:start');
    events.push('second:end');
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['first:start']);
  gate.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'second:end']);
  assert.equal(queue.pendingKeys(), 0);
});

test('different users can execute independently', async () => {
  const queue = new InteractionQueue<number>();
  const gate = deferred();
  const events: string[] = [];

  const first = queue.run(1, async () => {
    events.push('one:start');
    await gate.promise;
  });
  const second = queue.run(2, async () => {
    events.push('two:start');
  });

  await second;
  assert.deepEqual(events, ['one:start', 'two:start']);
  gate.resolve();
  await first;
});

test('a failed interaction does not block the next interaction', async () => {
  const queue = new InteractionQueue<number>();
  await assert.rejects(queue.run(1, async () => { throw new Error('failed'); }), /failed/u);
  const result = await queue.run(1, async () => 'recovered');
  assert.equal(result, 'recovered');
});
