import { defineTool } from '@earendil-works/pi-coding-agent';
import { config } from '../config/env.js';
import { appUserIdForTelegram, ensureTelegramUser, openDatabase } from '../db/database.js';
import { createScheduledTask, deleteScheduledTask, listScheduledTasks, setScheduledTaskEnabled } from '../scheduler/tasks.js';
import { formatTaskTime } from '../scheduler/parse.js';

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: 'text' as const, text }], details };
}

export function createScheduleTools(telegramUserId: number) {
  const userId = appUserIdForTelegram(telegramUserId);
  return [
    defineTool({
      name: 'furby_schedule_create',
      label: 'Create Furby Scheduled Task',
      description: 'Create a scheduled task when the user requests a reminder or recurring automation.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          title: { type: 'string' },
          runAtIso: { type: 'string', description: 'ISO date/time for one-time task.' },
          intervalSeconds: { type: 'number', description: 'Interval seconds for recurring task. If provided, task is recurring.' },
        },
        required: ['prompt'],
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const db = openDatabase();
        try {
          ensureTelegramUser(db, telegramUserId);
          const intervalSeconds = params.intervalSeconds ? Number(params.intervalSeconds) : undefined;
          const runAt = params.runAtIso ? new Date(String(params.runAtIso)) : undefined;
          if (runAt && Number.isNaN(runAt.getTime())) throw new Error('Invalid runAtIso.');
          const nextRunAt = intervalSeconds ? new Date(Date.now() + intervalSeconds * 1000) : runAt;
          if (!nextRunAt) throw new Error('Provide either runAtIso or intervalSeconds.');
          const id = createScheduledTask(db, {
            userId,
            telegramChatId: config.telegramUserId,
            title: params.title ? String(params.title) : undefined,
            prompt: String(params.prompt),
            scheduleKind: intervalSeconds ? 'interval' : 'once',
            intervalSeconds,
            runAt,
            nextRunAt,
          });
          return textResult(`Scheduled task ${id} for ${formatTaskTime(nextRunAt.toISOString())}.`, { id });
        } finally {
          db.close();
        }
      },
    }),
    defineTool({
      name: 'furby_schedule_list',
      label: 'List Furby Scheduled Tasks',
      description: 'List scheduled tasks, reminders, and automations.',
      parameters: {
        type: 'object',
        properties: { includeDisabled: { type: 'boolean', default: false } },
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const db = openDatabase();
        try {
          const tasks = listScheduledTasks(db, userId, Boolean(params.includeDisabled));
          return textResult(JSON.stringify(tasks, null, 2), { count: tasks.length });
        } finally {
          db.close();
        }
      },
    }),
    defineTool({
      name: 'furby_schedule_update',
      label: 'Update Furby Scheduled Task',
      description: 'Pause, resume, or delete a scheduled task.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          action: { type: 'string', enum: ['pause', 'resume', 'delete'] },
        },
        required: ['id', 'action'],
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const db = openDatabase();
        try {
          const id = String(params.id);
          const action = String(params.action);
          const ok = action === 'delete'
            ? deleteScheduledTask(db, id)
            : setScheduledTaskEnabled(db, id, action === 'resume');
          return textResult(ok ? `${action} applied to ${id}.` : `No task found for ${id}.`, { id, action, ok });
        } finally {
          db.close();
        }
      },
    }),
  ];
}
