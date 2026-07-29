import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { openDatabase } from '../src/db/database.js';
import { initializeSchema } from '../src/db/schema.js';
import { FurbyScheduler } from '../src/scheduler/runner.js';
import { parseScheduleCommand } from '../src/scheduler/parse.js';
import {
  claimDueScheduledTasks,
  completeClaimedTask,
  createScheduledTask,
  deleteScheduledTask,
  dueScheduledTasks,
  failClaimedTask,
  listScheduledTasks,
  markTaskCompleted,
  setScheduledTaskEnabled,
} from '../src/scheduler/tasks.js';

const baseNow = new Date('2026-06-01T20:00:00.000Z');

test('parseScheduleCommand parses one-time relative schedules', () => {
  const parsed = parseScheduleCommand('in 10m do remind me to check laundry', baseNow);
  assert.equal(parsed?.scheduleKind, 'once');
  assert.equal(parsed?.prompt, 'remind me to check laundry');
  assert.equal(parsed?.nextRunAt.toISOString(), '2026-06-01T20:10:00.000Z');
});

test('parseScheduleCommand parses recurring schedules', () => {
  const parsed = parseScheduleCommand('every 2h do check my email', baseNow);
  assert.equal(parsed?.scheduleKind, 'interval');
  assert.equal(parsed?.intervalSeconds, 7200);
  assert.equal(parsed?.prompt, 'check my email');
  assert.equal(parsed?.nextRunAt.toISOString(), '2026-06-01T22:00:00.000Z');
});

test('scheduled task lifecycle supports create/list/pause/resume/delete', () => {
  const db = new Database(':memory:');
  initializeSchema(db);
  db.prepare("INSERT INTO users (id, display_name) VALUES ('telegram:1', 'Test')").run();

  const id = createScheduledTask(db, {
    userId: 'telegram:1',
    telegramChatId: 1,
    title: 'Test task',
    prompt: 'say hello',
    scheduleKind: 'interval',
    intervalSeconds: 60,
    nextRunAt: new Date('2026-06-01T20:00:00.000Z'),
  });

  assert.equal(listScheduledTasks(db, 'telegram:1').length, 1);
  assert.equal(dueScheduledTasks(db, new Date('2026-06-01T20:00:01.000Z')).length, 1);

  assert.equal(setScheduledTaskEnabled(db, id, false), true);
  assert.equal(listScheduledTasks(db, 'telegram:1').length, 0);
  assert.equal(listScheduledTasks(db, 'telegram:1', true)[0].enabled, 0);

  assert.equal(setScheduledTaskEnabled(db, id, true), true);
  const task = dueScheduledTasks(db, new Date('2026-06-01T20:00:01.000Z'))[0];
  markTaskCompleted(db, task, new Date('2026-06-01T20:00:01.000Z'));
  const updated = listScheduledTasks(db, 'telegram:1')[0];
  assert.equal(updated.run_count, 1);
  assert.equal(updated.next_run_at, '2026-06-01T20:01:00.000Z');

  assert.equal(deleteScheduledTask(db, id), true);
  assert.equal(listScheduledTasks(db, 'telegram:1', true).length, 0);
  db.close();
});

test('scheduler atomically claims a due task once and records success', () => {
  const db = new Database(':memory:');
  initializeSchema(db);
  db.prepare("INSERT INTO users (id, display_name) VALUES ('telegram:1', 'Test')").run();
  const id = createScheduledTask(db, {
    userId: 'telegram:1',
    telegramChatId: 1,
    prompt: 'say hello',
    scheduleKind: 'once',
    nextRunAt: baseNow,
  });

  const firstClaims = claimDueScheduledTasks(db, new Date('2026-06-01T20:00:01.000Z'));
  const secondClaims = claimDueScheduledTasks(db, new Date('2026-06-01T20:00:02.000Z'));
  assert.equal(firstClaims.length, 1);
  assert.equal(secondClaims.length, 0);

  completeClaimedTask(db, firstClaims[0], 'hello', new Date('2026-06-01T20:00:03.000Z'));
  const task = listScheduledTasks(db, 'telegram:1', true).find((candidate) => candidate.id === id)!;
  assert.equal(task.enabled, 0);
  assert.equal(task.run_count, 1);
  assert.equal(task.claim_token, null);
  const run = db.prepare('SELECT status, output_text FROM scheduled_task_runs WHERE id = ?').get(firstClaims[0].runId) as any;
  assert.deepEqual(run, { status: 'success', output_text: 'hello' });
  db.close();
});

test('failed one-time tasks retry twice and then disable', () => {
  const db = new Database(':memory:');
  initializeSchema(db);
  db.prepare("INSERT INTO users (id, display_name) VALUES ('telegram:1', 'Test')").run();
  createScheduledTask(db, {
    userId: 'telegram:1',
    telegramChatId: 1,
    prompt: 'retry me',
    scheduleKind: 'once',
    nextRunAt: baseNow,
  });

  let now = new Date('2026-06-01T20:00:01.000Z');
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const claim = claimDueScheduledTasks(db, now)[0];
    assert.ok(claim);
    failClaimedTask(db, claim, `failure ${attempt}`, now);
    const task = listScheduledTasks(db, 'telegram:1', true)[0];
    assert.equal(task.failure_count, attempt);
    assert.equal(task.enabled, attempt < 3 ? 1 : 0);
    now = new Date(new Date(task.next_run_at).getTime() + 1);
  }
  db.close();
});

test('standalone Furby scheduler executes through the scheduled session purpose without Pi Scheduler', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'furby-scheduler-runner-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const databasePath = path.join(root, 'scheduler.db');
  const databaseFactory = () => openDatabase(databasePath);
  const db = databaseFactory();
  db.prepare("INSERT OR IGNORE INTO users (id, display_name) VALUES ('telegram:1', 'Test')").run();
  const taskId = createScheduledTask(db, {
    userId: 'telegram:1', telegramChatId: 1, prompt: 'standalone smoke',
    scheduleKind: 'once', nextRunAt: new Date(Date.now() - 1_000),
  });
  db.close();

  const prompts: any[][] = [];
  const deliveries: string[] = [];
  const bot = { api: { sendMessage: async (_chatId: number, text: string) => { deliveries.push(text); } } } as any;
  const runtime = { prompt: async (...args: any[]) => { prompts.push(args); return { text: 'scheduled answer' }; } } as any;
  const preferences = { getModel: () => 'test/model', getAccessScope: () => 'outside' } as any;
  const scheduler = new FurbyScheduler(bot, runtime, preferences, databaseFactory);
  await scheduler.tick();

  assert.equal(prompts.length, 1);
  assert.equal(prompts[0][3], 'outside');
  assert.equal(prompts[0][5], 'scheduled');
  assert.equal(deliveries.length, 1);
  const resultDb = databaseFactory();
  const task = listScheduledTasks(resultDb, 'telegram:1', true).find((candidate) => candidate.id === taskId)!;
  assert.equal(task.run_count, 1);
  assert.equal(task.enabled, 0);
  resultDb.close();
});

test('expired task claims can be recovered by another worker', () => {
  const db = new Database(':memory:');
  initializeSchema(db);
  db.prepare("INSERT INTO users (id, display_name) VALUES ('telegram:1', 'Test')").run();
  createScheduledTask(db, {
    userId: 'telegram:1',
    telegramChatId: 1,
    prompt: 'recover me',
    scheduleKind: 'once',
    nextRunAt: baseNow,
  });

  const first = claimDueScheduledTasks(db, baseNow, { leaseSeconds: 60 });
  assert.equal(first.length, 1);
  const recovered = claimDueScheduledTasks(db, new Date('2026-06-01T20:01:01.000Z'), { leaseSeconds: 60 });
  assert.equal(recovered.length, 1);
  assert.notEqual(recovered[0].claimToken, first[0].claimToken);
  const abandoned = db.prepare('SELECT status FROM scheduled_task_runs WHERE id = ?').get(first[0].runId) as { status: string };
  assert.equal(abandoned.status, 'abandoned');
  db.close();
});
