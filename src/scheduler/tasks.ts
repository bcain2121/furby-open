import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

export interface ScheduledTaskRow {
  id: string;
  user_id: string;
  telegram_chat_id: number;
  title: string | null;
  prompt: string;
  schedule_kind: 'once' | 'interval';
  interval_seconds: number | null;
  run_at: string | null;
  next_run_at: string;
  last_run_at: string | null;
  enabled: 0 | 1;
  run_count: number;
  failure_count: number;
  last_error: string | null;
  claim_token: string | null;
  claim_expires_at: string | null;
  created_at: string;
  updated_at: string;
  metadata_json: string;
}

export interface ClaimedScheduledTask {
  task: ScheduledTaskRow;
  runId: string;
  claimToken: string;
}

export function createScheduledTask(db: Database.Database, input: {
  userId: string;
  telegramChatId: number;
  title?: string;
  prompt: string;
  scheduleKind: 'once' | 'interval';
  intervalSeconds?: number;
  runAt?: Date;
  nextRunAt: Date;
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO scheduled_tasks (
      id, user_id, telegram_chat_id, title, prompt, schedule_kind, interval_seconds,
      run_at, next_run_at, created_at, updated_at, metadata_json
    ) VALUES (
      @id, @userId, @telegramChatId, @title, @prompt, @scheduleKind, @intervalSeconds,
      @runAt, @nextRunAt, @now, @now, '{}'
    )
  `).run({
    id,
    userId: input.userId,
    telegramChatId: input.telegramChatId,
    title: input.title ?? null,
    prompt: input.prompt,
    scheduleKind: input.scheduleKind,
    intervalSeconds: input.intervalSeconds ?? null,
    runAt: input.runAt?.toISOString() ?? null,
    nextRunAt: input.nextRunAt.toISOString(),
    now,
  });
  return id;
}

export function listScheduledTasks(db: Database.Database, userId?: string, includeDisabled = false) {
  const where = [userId ? 'user_id = @userId' : '1=1'];
  if (!includeDisabled) where.push('enabled = 1');
  return db.prepare(`
    SELECT * FROM scheduled_tasks
    WHERE ${where.join(' AND ')}
    ORDER BY enabled DESC, next_run_at ASC, created_at DESC
  `).all({ userId }) as ScheduledTaskRow[];
}

export function getScheduledTask(db: Database.Database, id: string) {
  return db.prepare('SELECT * FROM scheduled_tasks WHERE id = @id').get({ id }) as ScheduledTaskRow | undefined;
}

export function setScheduledTaskEnabled(db: Database.Database, id: string, enabled: boolean) {
  const result = db.prepare(`
    UPDATE scheduled_tasks
    SET enabled = @enabled,
        claim_token = NULL,
        claim_expires_at = NULL,
        updated_at = @now
    WHERE id = @id
  `).run({ id, enabled: enabled ? 1 : 0, now: new Date().toISOString() });
  return result.changes > 0;
}

export function deleteScheduledTask(db: Database.Database, id: string) {
  const result = db.prepare('DELETE FROM scheduled_tasks WHERE id = @id').run({ id });
  return result.changes > 0;
}

export function dueScheduledTasks(db: Database.Database, now = new Date()) {
  return db.prepare(`
    SELECT * FROM scheduled_tasks
    WHERE enabled = 1
      AND next_run_at <= @now
      AND (claim_expires_at IS NULL OR claim_expires_at <= @now)
    ORDER BY next_run_at ASC
    LIMIT 10
  `).all({ now: now.toISOString() }) as ScheduledTaskRow[];
}

export function claimDueScheduledTasks(
  db: Database.Database,
  now = new Date(),
  options: { limit?: number; leaseSeconds?: number } = {},
): ClaimedScheduledTask[] {
  const limit = Math.max(1, Math.min(options.limit ?? 10, 100));
  const leaseSeconds = Math.max(60, options.leaseSeconds ?? 1800);
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + leaseSeconds * 1000).toISOString();

  const claim = db.transaction(() => {
    const candidates = db.prepare(`
      SELECT * FROM scheduled_tasks
      WHERE enabled = 1
        AND next_run_at <= @now
        AND (claim_expires_at IS NULL OR claim_expires_at <= @now)
      ORDER BY next_run_at ASC
      LIMIT @limit
    `).all({ now: nowIso, limit }) as ScheduledTaskRow[];

    const results: ClaimedScheduledTask[] = [];
    for (const candidate of candidates) {
      const claimToken = crypto.randomUUID();
      const updated = db.prepare(`
        UPDATE scheduled_tasks
        SET claim_token = @claimToken, claim_expires_at = @expiresAt, updated_at = @now
        WHERE id = @id
          AND enabled = 1
          AND next_run_at <= @now
          AND (claim_expires_at IS NULL OR claim_expires_at <= @now)
      `).run({ id: candidate.id, claimToken, expiresAt, now: nowIso });
      if (updated.changes !== 1) continue;

      db.prepare(`
        UPDATE scheduled_task_runs
        SET status = 'abandoned',
            finished_at = @now,
            error_text = COALESCE(error_text, 'Task lease expired before completion'),
            delivery_status = 'not_applicable'
        WHERE task_id = @taskId AND status IN ('claimed', 'running')
      `).run({ taskId: candidate.id, now: nowIso });

      const runId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO scheduled_task_runs (id, task_id, started_at, status, claim_token, delivery_status, metadata_json)
        VALUES (@id, @taskId, @startedAt, 'claimed', @claimToken, 'pending', '{}')
      `).run({ id: runId, taskId: candidate.id, startedAt: nowIso, claimToken });
      const task = db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(candidate.id) as ScheduledTaskRow;
      results.push({ task, runId, claimToken });
    }
    return results;
  });

  return claim.immediate();
}

export function markTaskRunStarted(db: Database.Database, claim: ClaimedScheduledTask) {
  db.prepare(`
    UPDATE scheduled_task_runs SET status = 'running'
    WHERE id = @runId AND claim_token = @claimToken AND status = 'claimed'
  `).run({ runId: claim.runId, claimToken: claim.claimToken });
}

export function createTaskRun(db: Database.Database, taskId: string) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO scheduled_task_runs (id, task_id, started_at, status, delivery_status, metadata_json)
    VALUES (@id, @taskId, @startedAt, 'running', 'pending', '{}')
  `).run({ id, taskId, startedAt: new Date().toISOString() });
  return id;
}

export function finishTaskRun(db: Database.Database, id: string, status: 'success' | 'error', outputText?: string, errorText?: string) {
  db.prepare(`
    UPDATE scheduled_task_runs
    SET finished_at = @finishedAt, status = @status, output_text = @outputText, error_text = @errorText
    WHERE id = @id
  `).run({
    id,
    finishedAt: new Date().toISOString(),
    status,
    outputText: outputText ?? null,
    errorText: errorText ?? null,
  });
}

function nextFixedInterval(task: ScheduledTaskRow, now: Date) {
  const intervalMs = Math.max(1, task.interval_seconds ?? 1) * 1000;
  let next = new Date(task.next_run_at).getTime() + intervalMs;
  while (next <= now.getTime()) next += intervalMs;
  return new Date(next).toISOString();
}

export function completeClaimedTask(
  db: Database.Database,
  claim: ClaimedScheduledTask,
  outputText: string,
  now = new Date(),
) {
  const finish = db.transaction(() => {
    const task = getScheduledTask(db, claim.task.id);
    if (!task || task.claim_token !== claim.claimToken) throw new Error('Scheduled task claim is no longer active.');
    const nowIso = now.toISOString();
    const recurring = task.schedule_kind === 'interval' && Boolean(task.interval_seconds);
    const nextRunAt = recurring ? nextFixedInterval(task, now) : task.next_run_at;
    db.prepare(`
      UPDATE scheduled_task_runs
      SET finished_at = @now, status = 'success', output_text = @outputText, error_text = NULL
      WHERE id = @runId AND claim_token = @claimToken
    `).run({ now: nowIso, outputText, runId: claim.runId, claimToken: claim.claimToken });
    db.prepare(`
      UPDATE scheduled_tasks
      SET last_run_at = @now,
          next_run_at = @nextRunAt,
          enabled = @enabled,
          run_count = run_count + 1,
          failure_count = 0,
          last_error = NULL,
          claim_token = NULL,
          claim_expires_at = NULL,
          updated_at = @now
      WHERE id = @id AND claim_token = @claimToken
    `).run({
      id: task.id,
      claimToken: claim.claimToken,
      now: nowIso,
      nextRunAt,
      enabled: recurring ? 1 : 0,
    });
  });
  finish();
}

export function failClaimedTask(
  db: Database.Database,
  claim: ClaimedScheduledTask,
  errorText: string,
  now = new Date(),
  maxOneTimeAttempts = 3,
) {
  const finish = db.transaction(() => {
    const task = getScheduledTask(db, claim.task.id);
    if (!task || task.claim_token !== claim.claimToken) throw new Error('Scheduled task claim is no longer active.');
    const nowIso = now.toISOString();
    const failureCount = task.failure_count + 1;
    const recurring = task.schedule_kind === 'interval' && Boolean(task.interval_seconds);
    const retryOneTime = !recurring && failureCount < maxOneTimeAttempts;
    const retryDelaySeconds = Math.min(60 * (2 ** Math.max(0, failureCount - 1)), 900);
    const nextRunAt = recurring
      ? nextFixedInterval(task, now)
      : retryOneTime
        ? new Date(now.getTime() + retryDelaySeconds * 1000).toISOString()
        : task.next_run_at;

    db.prepare(`
      UPDATE scheduled_task_runs
      SET finished_at = @now,
          status = 'error',
          error_text = @errorText,
          delivery_status = 'not_applicable'
      WHERE id = @runId AND claim_token = @claimToken
    `).run({ now: nowIso, errorText, runId: claim.runId, claimToken: claim.claimToken });
    db.prepare(`
      UPDATE scheduled_tasks
      SET next_run_at = @nextRunAt,
          enabled = @enabled,
          failure_count = @failureCount,
          last_error = @errorText,
          claim_token = NULL,
          claim_expires_at = NULL,
          updated_at = @now
      WHERE id = @id AND claim_token = @claimToken
    `).run({
      id: task.id,
      claimToken: claim.claimToken,
      now: nowIso,
      nextRunAt,
      enabled: recurring || retryOneTime ? 1 : 0,
      failureCount,
      errorText,
    });
  });
  finish();
}

export function markTaskDelivery(
  db: Database.Database,
  runId: string,
  status: 'sent' | 'failed',
  errorText?: string,
) {
  db.prepare(`
    UPDATE scheduled_task_runs
    SET delivery_status = @status, delivery_error = @errorText
    WHERE id = @runId
  `).run({ runId, status, errorText: errorText ?? null });
}

// Compatibility helper for direct lifecycle tests and older callers.
export function markTaskCompleted(db: Database.Database, task: ScheduledTaskRow, now = new Date()) {
  const recurring = task.schedule_kind === 'interval' && Boolean(task.interval_seconds);
  const nextRunAt = recurring ? nextFixedInterval(task, now) : task.next_run_at;
  db.prepare(`
    UPDATE scheduled_tasks
    SET last_run_at = @lastRunAt,
        next_run_at = @nextRunAt,
        enabled = @enabled,
        run_count = run_count + 1,
        failure_count = 0,
        last_error = NULL,
        claim_token = NULL,
        claim_expires_at = NULL,
        updated_at = @lastRunAt
    WHERE id = @id
  `).run({ id: task.id, lastRunAt: now.toISOString(), nextRunAt, enabled: recurring ? 1 : 0 });
}
