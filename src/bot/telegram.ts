import fs from 'node:fs';
import path from 'node:path';
import { Bot } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { config } from '../config/env.js';
import { transcribeAudio } from '../audio/transcription.js';
import { openDatabase } from '../db/database.js';
import { updateMediaPreview } from '../db/media.js';
import { PreferenceStore } from '../storage/preferences.js';
import { createTelegramCommandHandler } from './commands.js';
import { saveTelegramMedia } from './media.js';
import { sendTelegramMarkdownChunks } from './telegram-delivery.js';
import { escapeTelegramHtml } from './telegram-format.js';
import { InteractiveMessageBroker, combineInteractiveMessages, type InteractiveMessage } from '../runtime/interactive-message-broker.js';
import type { FurbyPiRuntime } from '../runtime/pi-session.js';

function escapeHtml(text: string) {
  return escapeTelegramHtml(text);
}

function code(text: string) {
  return `<code>${escapeHtml(text)}</code>`;
}

function telegramErrorDetails(error: unknown) {
  const record = error && typeof error === 'object' ? error as Record<string, any> : {};
  return {
    name: error instanceof Error ? error.name : undefined,
    message: error instanceof Error ? error.message : String(error),
    errorCode: record.error_code ?? record.error?.error_code,
    description: record.description ?? record.error?.description,
    retryAfter: record.parameters?.retry_after ?? record.error?.parameters?.retry_after,
    method: record.method,
  };
}

function logTelegramRuntime(event: string, details: Record<string, unknown> = {}) {
  try {
    const logPath = path.join(config.rootDir, 'logs', 'telegram-runtime.jsonl');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...details })}\n`);
  } catch {
    // Runtime logging must never interfere with Telegram delivery.
  }
}

export function createTelegramBot(runtime: FurbyPiRuntime, preferences: PreferenceStore) {
  const bot = new Bot(config.telegramBotToken);
  bot.api.config.use(autoRetry({ maxDelaySeconds: 60, maxRetryAttempts: 3 }));
  const handleCommand = createTelegramCommandHandler(runtime, preferences);
  const broker = new InteractiveMessageBroker<number>(config.telegramCoalesceMs);

  bot.catch((failure) => {
    logTelegramRuntime('update_handler.failed', telegramErrorDetails(failure.error));
    console.error('[telegram] update handler failed', failure.error);
    void failure.ctx.reply('❌ That update failed, but the assistant is still running. Please try again.').catch(() => undefined);
  });

  void bot.api.setMyCommands([
    { command: 'help', description: 'Show Furby help' },
    { command: 'commands', description: 'Show commands and Pi passthrough help' },
    { command: 'status', description: 'Show runtime status' },
    { command: 'model', description: 'Toggle/list quick-select models' },
    { command: 'models', description: 'List available authenticated models' },
    { command: 'skills', description: 'List loaded Pi skills' },
    { command: 'files', description: 'List recent uploads' },
    { command: 'memories', description: 'Search assistant memories' },
    { command: 'transcript', description: 'Show latest voice transcript' },
    { command: 'sendfile', description: 'Send a vault file/photo back to Telegram' },
    { command: 'schedule', description: 'Manage scheduled tasks' },
    { command: 'access', description: 'Show persistent access scope' },
    { command: 'outside', description: 'Enable persistent host access' },
    { command: 'project', description: 'Return to project-confined access' },
    { command: 'reset', description: 'Reset current Pi session' },
  ]).catch((error) => console.warn('[telegram] setMyCommands failed', error));

  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || userId !== config.telegramUserId) {
      console.warn(`[auth] rejected Telegram user ${userId ?? 'unknown'}`);
      return;
    }
    await next();
  });

  async function replyModelText(ctx: { reply: (body: string, options?: { parse_mode: 'HTML' }) => Promise<unknown> }, text: string) {
    await sendTelegramMarkdownChunks(
      (body, options) => ctx.reply(body, options),
      text,
      {
        onFormattedChunkError: (error, chunkIndex) => {
          logTelegramRuntime('reply_chunk.formatting_failed', {
            chunkIndex,
            ...telegramErrorDetails(error),
          });
          console.warn(`[telegram] formatted reply chunk ${chunkIndex + 1} failed; retrying as escaped plain text`, error);
        },
        onRateLimitRetry: (error, attempt, delayMs) => {
          logTelegramRuntime('reply_chunk.rate_limited', {
            attempt,
            delayMs,
            ...telegramErrorDetails(error),
          });
          console.warn(`[telegram] rate limited; retry ${attempt} in ${delayMs}ms`, error);
        },
      },
    );
  }

  async function submitInteractive(ctx: any, message: InteractiveMessage) {
    const userId = ctx.from.id as number;
    const model = preferences.getModel(userId) ?? config.defaultModel;
    const accessScope = preferences.getAccessScope(userId);
    const submission = broker.submit(userId, message, {
      runInitial: async (messages) => runtime.promptInteractiveBatch(
        userId,
        combineInteractiveMessages(messages),
        model,
        accessScope,
        messages.flatMap((item) => item.images ?? []),
      ),
      steer: async (nextMessage) => runtime.steerInteractive(userId, nextMessage.text, nextMessage.images ?? []),
    });
    if (!submission.owner || !submission.completion) return;

    const sendTyping = () => ctx.api.sendChatAction(ctx.chat.id, 'typing').catch(() => undefined);
    await sendTyping();
    const typingTimer = setInterval(sendTyping, 4_000);
    try {
      const response = await submission.completion;
      clearInterval(typingTimer);
      await replyModelText(ctx, response.text);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logTelegramRuntime('prompt_or_delivery.failed', telegramErrorDetails(error));
      console.error('[telegram] prompt failed', error);
      await ctx.reply(`❌ ${escapeHtml(errorMessage)}`, { parse_mode: 'HTML' });
    } finally {
      clearInterval(typingTimer);
    }
  }

  function startInteractive(ctx: any, message: InteractiveMessage) {
    void submitInteractive(ctx, message).catch(async (error) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logTelegramRuntime('interactive_submission.failed', telegramErrorDetails(error));
      console.error('[telegram] interactive submission failed', error);
      await ctx.reply(`❌ ${escapeHtml(errorMessage)}`, { parse_mode: 'HTML' }).catch(() => undefined);
    });
  }

  bot.on('message:text', async (ctx) => {
    const userId = ctx.from!.id;
    const text = ctx.message.text.trim();

    if (text.startsWith('!') || text.startsWith('/')) {
      await broker.waitForIdle(userId);
      await handleCommand({
        text,
        userId,
        reply: (body: string) => ctx.reply(body, { parse_mode: 'HTML' }),
        replyFormatted: (body: string) => replyModelText(ctx, body),
        typing: () => ctx.api.sendChatAction(userId, 'typing'),
      });
      return;
    }

    startInteractive(ctx, { text });
  });

  bot.on('message:photo', async (ctx) => {
    const userId = ctx.from!.id;
    await ctx.api.sendChatAction(userId, 'typing');
    try {
      const photos = ctx.message.photo;
      const photo = photos[photos.length - 1];
      const asset = await saveTelegramMedia({
        telegramUserId: userId,
        file: photo,
        kind: 'photo',
        fallbackMimeType: 'image/jpeg',
        fallbackName: 'photo',
      });
      const caption = ctx.message.caption?.trim() || 'Please inspect this image.';
      startInteractive(ctx, {
        text: `${caption}\n\n[Image saved to the configured workspace: ${asset.vaultPath}]`,
        images: [{ mediaType: asset.mimeType, data: fs.readFileSync(asset.absolutePath).toString('base64') }],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[telegram] photo failed', error);
      await ctx.reply(`❌ ${escapeHtml(message)}`, { parse_mode: 'HTML' });
    }
  });

  bot.on('message:document', async (ctx) => {
    const userId = ctx.from!.id;
    await ctx.api.sendChatAction(userId, 'typing');
    try {
      const document = ctx.message.document;
      const asset = await saveTelegramMedia({
        telegramUserId: userId,
        file: document,
        kind: 'document',
        fallbackMimeType: document.mime_type || 'application/octet-stream',
        fallbackName: document.file_name || 'document',
      });
      await ctx.reply([
        '📎 Saved document to the configured workspace.',
        '',
        `Path: ${code(asset.vaultPath)}`,
        `Type: ${code(asset.mimeType)}`,
        `Preview: ${escapeHtml(asset.previewText || 'No preview available.')}`,
        '',
        'Ask me to read/analyze it when you want full extraction.',
      ].join('\n'), { parse_mode: 'HTML' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[telegram] document failed', error);
      await ctx.reply(`❌ ${escapeHtml(message)}`, { parse_mode: 'HTML' });
    }
  });

  bot.on('message:voice', async (ctx) => {
    const userId = ctx.from!.id;
    await ctx.api.sendChatAction(userId, 'typing');
    try {
      const voice = ctx.message.voice;
      const asset = await saveTelegramMedia({
        telegramUserId: userId,
        file: voice,
        kind: 'voice',
        fallbackMimeType: voice.mime_type || 'audio/ogg',
        fallbackName: 'voice',
      });
      const transcript = await transcribeAudio(asset.absolutePath, asset.mimeType);
      const db = openDatabase();
      try {
        updateMediaPreview(db, asset.id, `Transcript: ${transcript.text}`);
      } finally {
        db.close();
      }
      startInteractive(ctx, {
        text: `Voice message transcript (${transcript.provider}/${transcript.model}); audio saved to the configured workspace at ${asset.vaultPath}:\n\n${transcript.text}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[telegram] voice failed', error);
      await ctx.reply(`❌ ${escapeHtml(message)}`, { parse_mode: 'HTML' });
    }
  });


  return Object.assign(bot, {
    disposeInteractiveBroker: () => broker.dispose(),
    waitForInteractiveIdle: () => broker.waitForIdle(),
  });
}
