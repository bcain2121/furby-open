import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoundedJobQueue } from '../src/media/job-queue.js';

test('bounded media queue limits concurrent work', async () => {
  const queue = new BoundedJobQueue(2);
  let active = 0;
  let maximum = 0;
  const jobs = Array.from({ length: 6 }, (_, index) => queue.run(async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return index;
  }));
  assert.deepEqual(await Promise.all(jobs), [0, 1, 2, 3, 4, 5]);
  assert.equal(maximum, 2);
  assert.deepEqual(queue.status(), { active: 0, waiting: 0, concurrency: 2 });
});
