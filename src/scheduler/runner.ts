import type { Bot } from 'grammy';
import { config } from '../config/env.js';
import { appUserIdForTelegram, openDatabase } from '../db/database.js';
import { logEvent } from '../observability/logger.js';
import type { FurbyPiRuntime } from '../runtime/pi-session.js';
import type { PreferenceStore } from '../storage/preferences.js';
import { sendTelegramMarkdownChunks } from '../bot/telegram-delivery.js';
import { escapeTelegramHtml } from '../bot/telegram-format.js';
import {
  claimDueScheduledTasks,
  completeClaimedTask,
  failClaimedTask,
  markTaskDelivery,
  markTaskRunStarted,
} from './tasks.js';

function escapeHtml(text: string) {
  return escapeTelegramHtml(text);
}

export class FurbyScheduler {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly bot: Bot,
    private readonly runtime: FurbyPiRuntime,
    private readonly preferences: PreferenceStore,
    private readonly databaseFactory: typeof openDatabase = openDatabase,
  ) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((error) => console.error('[scheduler] tick failed', error));
    }, 30_000);
    void this.tick();
    console.log('[scheduler] started');
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    console.log('[scheduler] stopped');
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const db = this.databaseFactory();
      const claims = claimDueScheduledTasks(db);
      db.close();

      for (const claim of claims) {
        const task = claim.task;
        logEvent('info', 'scheduled_task.claimed', { taskId: task.id, runId: claim.runId });
        const startDb = this.databaseFactory();
        markTaskRunStarted(startDb, claim);
        startDb.close();

        const telegramUserId = Number(task.user_id.replace(/^telegram:/u, '')) || config.telegramUserId;
        const model = this.preferences.getModel(telegramUserId) ?? config.defaultModel;
        const toolMode = this.preferences.getToolMode(telegramUserId) ?? config.toolMode;

        let responseText: string;
        try {
          const response = await this.runtime.prompt(
            telegramUserId,
            `Scheduled assistant task: ${task.prompt}`,
            model,
            toolMode,
            [],
            'scheduled',
          );
          responseText = response.text;
          const doneDb = this.databaseFactory();
          completeClaimedTask(doneDb, claim, responseText);
          doneDb.close();
          logEvent('info', 'scheduled_task.executed', { taskId: task.id, runId: claim.runId });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logEvent('error', 'scheduled_task.failed', { taskId: task.id, runId: claim.runId, error: message });
          const failDb = this.databaseFactory();
          failClaimedTask(failDb, claim, message);
          failDb.close();
          await this.bot.api.sendMessage(
            task.telegram_chat_id,
            `❌ Scheduled task failed and will follow its retry policy: ${escapeHtml(message)}`,
            { parse_mode: 'HTML' },
          ).catch(() => undefined);
          continue;
        }

        const telegramResult = [
          '**Scheduled assistant task**',
          task.title ? `Task: ${task.title}` : '',
          '',
          responseText,
        ].filter(Boolean).join('\n');

        try {
          await sendTelegramMarkdownChunks(
            (body, options) => this.bot.api.sendMessage(task.telegram_chat_id, body, options),
            telegramResult,
            {
              onFormattedChunkError: (error, chunkIndex) => {
                console.warn(`[scheduler] formatted Telegram chunk ${chunkIndex + 1} failed; retrying as escaped plain text`, error);
              },
            },
          );
          const deliveryDb = this.databaseFactory();
          markTaskDelivery(deliveryDb, claim.runId, 'sent');
          deliveryDb.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logEvent('error', 'scheduled_task.delivery_failed', { taskId: task.id, runId: claim.runId, error: message });
          const deliveryDb = this.databaseFactory();
          markTaskDelivery(deliveryDb, claim.runId, 'failed', message);
          deliveryDb.close();
        }
      }
    } finally {
      this.running = false;
    }
  }
}

export function defaultSchedulerUserId() {
  return appUserIdForTelegram(config.telegramUserId);
}
