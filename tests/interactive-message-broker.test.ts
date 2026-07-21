import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  InteractiveMessageBroker,
  combineInteractiveMessages,
  type InteractiveMessage,
} from '../src/runtime/interactive-message-broker.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test('rapid messages are combined in their original order', () => {
  const combined = combineInteractiveMessages([
    { text: 'one' }, { text: 'two' }, { text: 'three' }, { text: 'four' },
  ]);
  assert.match(combined, /Treat them as one request/u);
  assert.ok(combined.indexOf('one') < combined.indexOf('two'));
  assert.ok(combined.indexOf('two') < combined.indexOf('three'));
  assert.ok(combined.indexOf('three') < combined.indexOf('four'));
  assert.equal(combineInteractiveMessages([{ text: 'single' }]), 'single');
});

test('four messages in the coalescing window create one run and one owner', async () => {
  const broker = new InteractiveMessageBroker<number>(15);
  const runs: readonly InteractiveMessage[][] = [];
  const handlers = {
    runInitial: async (messages: readonly InteractiveMessage[]) => {
      (runs as InteractiveMessage[][]).push([...messages]);
      return { text: 'combined response' };
    },
    steer: async () => undefined,
  };

  const submissions = ['one', 'two', 'three', 'four'].map((text) => broker.submit(1, { text }, handlers));
  assert.deepEqual(submissions.map((submission) => submission.owner), [true, false, false, false]);
  assert.equal((await submissions[0].completion!).text, 'combined response');
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0].map((message) => message.text), ['one', 'two', 'three', 'four']);
  assert.equal(broker.pendingKeys(), 0);
});

test('messages received while a run is active are steered into that run', async () => {
  const broker = new InteractiveMessageBroker<number>(0);
  const gate = deferred<{ text: string }>();
  const steered: string[] = [];
  const first = broker.submit(1, { text: 'initial' }, {
    runInitial: async () => gate.promise,
    steer: async (message) => { steered.push(message.text); },
  });
  await wait(5);
  const second = broker.submit(1, { text: 'mid-run one' }, {
    runInitial: async () => ({ text: 'should not run' }),
    steer: async () => undefined,
  });
  const third = broker.submit(1, { text: 'mid-run two' }, {
    runInitial: async () => ({ text: 'should not run' }),
    steer: async () => undefined,
  });
  assert.equal(second.owner, false);
  assert.equal(third.owner, false);
  gate.resolve({ text: 'final answer' });
  assert.equal((await first.completion!).text, 'final answer');
  assert.deepEqual(steered, ['mid-run one', 'mid-run two']);
});

test('a failed batch releases the user for a new interaction', async () => {
  const broker = new InteractiveMessageBroker<number>(0);
  const failed = broker.submit(1, { text: 'fail' }, {
    runInitial: async () => { throw new Error('provider failed'); },
    steer: async () => undefined,
  });
  await assert.rejects(failed.completion!, /provider failed/u);
  const recovered = broker.submit(1, { text: 'recover' }, {
    runInitial: async () => ({ text: 'recovered' }),
    steer: async () => undefined,
  });
  assert.equal(recovered.owner, true);
  assert.equal((await recovered.completion!).text, 'recovered');
});
