import { config } from '../config/env.js';
import { appUserIdForTelegram, ensureTelegramUser, openDatabase } from '../db/database.js';
import { listRecentMediaAssets } from '../db/media.js';
import { searchConversationMessages, searchMemories } from '../db/memory.js';
import { listAvailableModelSummary, loadPiScopedModels, nextScopedModel, parseModelName } from '../models/model-selection.js';
import { securityModeSummary } from '../runtime/capability-policy.js';
import { sendVaultFileToTelegram } from '../runtime/telegram-tools.js';
import type { FurbyPiRuntime } from '../runtime/pi-session.js';
import { formatScheduleHelp, formatTaskTime, parseScheduleCommand } from '../scheduler/parse.js';
import { createScheduledTask, deleteScheduledTask, listScheduledTasks, setScheduledTaskEnabled } from '../scheduler/tasks.js';
import type { PreferenceStore } from '../storage/preferences.js';
import { escapeTelegramHtml, splitTelegramText } from './telegram-format.js';

function escapeHtml(text: string) {
  return escapeTelegramHtml(text);
}

function code(text: string) {
  return `<code>${escapeHtml(text)}</code>`;
}

export function paginateTelegramLines(lines: readonly string[], maxBodyLength = 3_800) {
  const pages: string[][] = [];
  let current: string[] = [];
  let currentLength = 0;
  for (const line of lines) {
    for (const fragment of splitTelegramText(line, maxBodyLength)) {
      const separatorLength = current.length > 0 ? 1 : 0;
      if (current.length > 0 && currentLength + separatorLength + fragment.length > maxBodyLength) {
        pages.push(current);
        current = [];
        currentLength = 0;
      }
      current.push(fragment);
      currentLength += fragment.length + (current.length > 1 ? 1 : 0);
    }
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

export interface TelegramCommandContext {
  text: string;
  userId: number;
  reply: (body: string) => Promise<unknown>;
  replyFormatted: (body: string) => Promise<unknown>;
  typing: () => Promise<unknown>;
}

export function createTelegramCommandHandler(runtime: FurbyPiRuntime, preferences: PreferenceStore) {
  async function handleCommand({
    text,
    userId,
    reply,
    replyFormatted,
    typing,
  }: TelegramCommandContext) {
    const [rawCommandWithMaybeMention, ...args] = text.split(/\s+/u);
    const rawCommand = rawCommandWithMaybeMention.replace(/@[^\s]+$/u, '');
    const commandName = rawCommand.slice(1).toLowerCase();
    const command = `!${commandName}`;
    const argument = args.join(' ').trim();

    if (command === '!help') {
      await reply([
        `<b>${escapeHtml(config.name)}</b>`,
        '',
        `${code('/model')} — toggle between Pi quick-select models`,
        `${code('/model list')} — show Pi quick-select models`,
        `${code('/model gpt56')} — explicitly use ChatGPT Codex GPT-5.6 SOL`,
        `${code('/model minimax3')} — explicitly use MiniMax M3`,
        `${code('/models')} — list available authenticated models`,
        `${code('/status')} — show active runtime status`,
        `${code('/commands')} — show Furby command and Pi passthrough help`,
        `${code('/skills')} — list loaded Pi skills`,
        `${code('/files')} — list recent Telegram uploads`,
        `${code('/memories movie database')} — search assistant memories`,
        `${code('/transcript')} — show most recent voice transcript if available`,
        `${code('/sendfile generated/images/example.png')} — send a vault file/photo back to Telegram`,
        `${code('/schedule list')} — list scheduled tasks`,
        `${code('/schedule every 30m do ...')} — create recurring task`,
        `${code('/schedule in 10m do ...')} — create one-time reminder`,
        `${code('/security safe')} — switch to read-only/safe tool mode`,
        `${code('/security coding')} — switch to full coding tool mode`,
        `${code('/skill:name')} or ${code('!skill:name')} — run Pi slash command ${code('/skill:name')}`,
        `${code('/<pi-command>')} or ${code('!<pi-command>')} — forwards unknown commands to Pi`,
        `${code('/reset')} — reset current Pi session`,
        '',
        `Legacy ${code('!commands')} still work too.`,
      ].join('\n'));
      return;
    }

    if (command === '!model') {
      const current = preferences.getModel(userId) ?? config.defaultModel;
      const scoped = loadPiScopedModels();
      if (!argument) {
        const requested = nextScopedModel(current);
        let canonical: string;
        try {
          canonical = await runtime.validateModel(requested);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await reply(`❌ ${escapeHtml(message)}`);
          return;
        }
        preferences.setModel(userId, canonical);
        await runtime.reset(userId);
        await reply([
          `✅ Model switched to ${code(canonical)}`,
          '',
          `<b>Pi quick-select models</b>`,
          ...scoped.map((model) => `${model === canonical ? '→' : ' '} ${code(model)}`),
        ].join('\n'));
        return;
      }

      if (['list', 'status', 'help'].includes(argument.toLowerCase())) {
        await reply([
          '<b>Model quick-select</b>',
          '',
          `Current: ${code(current)}`,
          '',
          ...scoped.map((model) => `${model === current ? '→' : ' '} ${code(model)}`),
          '',
          `${code('/model')} toggles to the next Pi quick-select model.`,
          `You can still set explicitly: ${code('/model gpt56')} or ${code('/model minimax3')}.`,
        ].join('\n'));
        return;
      }

      const exactScoped = scoped.find((model) => model.toLowerCase().includes(argument.toLowerCase()));
      const requested = exactScoped ?? parseModelName(argument).canonical;
      let canonical: string;
      try {
        canonical = await runtime.validateModel(requested);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await reply(`❌ ${escapeHtml(message)}`);
        return;
      }
      preferences.setModel(userId, canonical);
      await runtime.reset(userId);
      await reply(`✅ Model set to ${code(canonical)}`);
      return;
    }

    if (command === '!commands') {
      await reply([
        '<b>Assistant commands</b>',
        '',
        `${code('/help')} ${code('/status')} ${code('/model')} ${code('/models')}`,
        `${code('/skills')} ${code('/files')} ${code('/memories <query>')} ${code('/transcript')} ${code('/sendfile <path>')}`,
        `${code('/schedule list')} ${code('/schedule every 30m do ...')} ${code('/schedule in 10m do ...')}`,
        `${code('/security safe|coding')} ${code('/reset')}`,
        '',
        '<b>Pi passthrough</b>',
        `Known Telegram slash commands are handled by Furby. Unknown slash commands are forwarded to Pi as-is.`,
        `Legacy !commands still work and unknown !commands are converted to Pi slash commands. Example: ${code('/skill:deep-research research topic')} or ${code('!skill:deep-research research topic')}`,
        'This works for SDK-visible extension commands, skill commands, and prompt templates. Some TUI-only Pi built-ins are not available over Telegram.',
      ].join('\n'));
      return;
    }

    if (command === '!skills') {
      const skills = await runtime.listSkills(80);
      const pages = paginateTelegramLines(
        skills.map((skill) => `${code(skill.name)} — ${escapeHtml(skill.description).slice(0, 160)}`),
      );
      for (const [index, page] of pages.entries()) {
        await reply([
          `<b>Loaded Pi skills</b> (${index + 1}/${pages.length})`,
          '',
          ...page,
        ].join('\n'));
      }
      return;
    }

    if (command === '!files') {
      const db = openDatabase();
      try {
        const rows = listRecentMediaAssets(db, appUserIdForTelegram(userId), 10);
        if (rows.length === 0) {
          await reply('No recent uploaded files found.');
          return;
        }
        await reply([
          '<b>Recent uploads</b>',
          '',
          ...rows.map((asset, index) => `${index + 1}. ${code(asset.vault_path)}\n   ${escapeHtml(asset.mime_type ?? 'unknown')} — ${escapeHtml(asset.preview_text ?? '').slice(0, 180)}`),
        ].join('\n'));
      } finally {
        db.close();
      }
      return;
    }

    if (command === '!memories') {
      if (!argument) {
        await reply(`Usage: ${code('!memories <query>')}`);
        return;
      }
      const db = openDatabase();
      try {
        const memories = searchMemories(db, appUserIdForTelegram(userId), argument, 8);
        const conversations = searchConversationMessages(db, appUserIdForTelegram(userId), argument, 5);
        await reply([
          `<b>Memory search:</b> ${escapeHtml(argument)}`,
          '',
          '<b>Memories</b>',
          ...(memories.length ? memories.map((memory, index) => `${index + 1}. ${escapeHtml(memory.content).slice(0, 400)}`) : ['No matching memories.']),
          '',
          '<b>Conversation hits</b>',
          ...(conversations.length ? conversations.map((hit, index) => `${index + 1}. ${escapeHtml(hit.role)}: ${escapeHtml(hit.content).slice(0, 300)}`) : ['No matching conversation hits.']),
        ].join('\n'));
      } finally {
        db.close();
      }
      return;
    }

    if (command === '!sendfile') {
      if (!argument) {
        await reply(`Usage: ${code('/sendfile <vault-path>')}`);
        return;
      }
      await typing();
      try {
        const result = await sendVaultFileToTelegram(argument);
        await reply(`✅ Sent ${code(result.vaultPath)} to Telegram.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await reply(`❌ ${escapeHtml(message)}`);
      }
      return;
    }

    if (command === '!transcript') {
      const db = openDatabase();
      try {
        const rows = listRecentMediaAssets(db, appUserIdForTelegram(userId), 20);
        const voice = rows.find((asset) => {
          try {
            const meta = JSON.parse(asset.metadata_json || '{}');
            return meta.kind === 'voice';
          } catch {
            return false;
          }
        });
        if (!voice?.preview_text || !voice.preview_text.startsWith('Transcript:')) {
          await reply('No recent voice transcript found.');
          return;
        }
        await reply(escapeHtml(voice.preview_text));
      } finally {
        db.close();
      }
      return;
    }

    if (command === '!schedule') {
      const db = openDatabase();
      try {
        const userAppId = ensureTelegramUser(db, userId);
        const sub = args[0]?.toLowerCase();
        if (!argument || sub === 'help') {
          await reply(escapeHtml(formatScheduleHelp()));
          return;
        }
        if (sub === 'list' || sub === 'all') {
          const tasks = listScheduledTasks(db, userAppId, sub === 'all');
          if (tasks.length === 0) {
            await reply('No scheduled tasks.');
            return;
          }
          await reply([
            '<b>Scheduled assistant tasks</b>',
            '',
            ...tasks.map((task, index) => [
              `${index + 1}. ${code(task.id.slice(0, 8))} ${task.enabled ? '✅' : '⏸️'} ${escapeHtml(task.title ?? task.prompt).slice(0, 120)}`,
              `   Next: ${escapeHtml(formatTaskTime(task.next_run_at, config.assistantTimezone))} | Runs: ${task.run_count} | ${escapeHtml(task.schedule_kind)}`,
            ].join('\n')),
          ].join('\n'));
          return;
        }
        if (['delete', 'pause', 'resume'].includes(sub)) {
          const idPrefix = args[1];
          if (!idPrefix) {
            await reply(`Usage: ${code(`!schedule ${sub} <id>`)}`);
            return;
          }
          const tasks = listScheduledTasks(db, userAppId, true);
          const task = tasks.find((candidate) => candidate.id === idPrefix || candidate.id.startsWith(idPrefix));
          if (!task) {
            await reply(`No task found for ${code(idPrefix)}.`);
            return;
          }
          const ok = sub === 'delete'
            ? deleteScheduledTask(db, task.id)
            : setScheduledTaskEnabled(db, task.id, sub === 'resume');
          await reply(ok ? `✅ ${escapeHtml(sub)} applied to ${code(task.id.slice(0, 8))}.` : 'No change made.');
          return;
        }
        const spec = parseScheduleCommand(argument);
        if (!spec) {
          await reply(escapeHtml(formatScheduleHelp()));
          return;
        }
        const id = createScheduledTask(db, {
          userId: userAppId,
          telegramChatId: userId,
          title: spec.title,
          prompt: spec.prompt,
          scheduleKind: spec.scheduleKind,
          intervalSeconds: spec.intervalSeconds,
          runAt: spec.runAt,
          nextRunAt: spec.nextRunAt,
        });
        await reply([
          '✅ Scheduled.',
          `ID: ${code(id.slice(0, 8))}`,
          `Next: ${escapeHtml(formatTaskTime(spec.nextRunAt.toISOString(), config.assistantTimezone))}`,
          `Prompt: ${escapeHtml(spec.prompt)}`,
        ].join('\n'));
      } finally {
        db.close();
      }
      return;
    }

    if (command === '!models') {
      const models = await listAvailableModelSummary(runtime.modelRegistry, 30);
      if (models.length === 0) {
        await reply('No authenticated models found. Run <code>pi</code> then <code>/login</code>, or add API keys.');
        return;
      }
      await reply([
        '<b>Available models</b>',
        '',
        ...models.map((model) => `${code(`${model.provider}/${model.id}`)} — ${escapeHtml(model.name)}`),
      ].join('\n'));
      return;
    }

    if (command === '!status') {
      const status = runtime.status(userId);
      const configuredToolMode = preferences.getToolMode(userId) ?? config.toolMode;
      await reply([
        '<b>Runtime status</b>',
        '',
        `Configured model: ${code(preferences.getModel(userId) ?? config.defaultModel)}`,
        `Session requested model: ${code(status.requestedModel ?? 'none')}`,
        `Active session model: ${code(status.model ?? 'none')}`,
        `Fallback active: ${code(status.fallbackUsed ? 'yes' : 'no')}`,
        `Configured security/tool mode: ${code(configuredToolMode)}`,
        `Active session tool mode: ${code(status.toolMode)}`,
        `Thinking: ${code(status.thinkingLevel)}`,
        `Pi agent dir: ${code(status.agentDir)}`,
      ].join('\n'));
      return;
    }

    if (command === '!security-mode' || command === '!security') {
      const normalized = argument.toLowerCase();
      if (!normalized || normalized === 'status') {
        const currentMode = preferences.getToolMode(userId) ?? config.toolMode;
        await reply([
          '<b>Security mode</b>',
          '',
          `Current: ${code(currentMode)}`,
          `Effective access: ${escapeHtml(securityModeSummary(currentMode))}`,
          '',
          `${code('safe')} = ${escapeHtml(securityModeSummary('safe'))}`,
          `${code('coding')} = ${escapeHtml(securityModeSummary('coding'))}`,
        ].join('\n'));
        return;
      }
      if (!['safe', 'coding'].includes(normalized)) {
        await reply(`Unknown security mode ${code(argument)}. Use ${code('safe')} or ${code('coding')}.`);
        return;
      }
      preferences.setToolMode(userId, normalized as 'safe' | 'coding');
      await runtime.reset(userId);
      await reply(`✅ Security mode set to ${code(normalized)}. Session reset so the new tool allowlist takes effect.`);
      return;
    }

    if (command === '!reset') {
      await runtime.reset(userId);
      await reply('🗑️ Session reset.');
      return;
    }

    await typing();
    const slashCommand = `/${rawCommand.slice(1)}${argument ? ` ${argument}` : ''}`;
    try {
      const model = preferences.getModel(userId) ?? config.defaultModel;
      const toolMode = preferences.getToolMode(userId) ?? config.toolMode;
      const response = await runtime.prompt(userId, slashCommand, model, toolMode);
      await replyFormatted(response.text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await reply([
        `❌ Pi command failed: ${code(slashCommand)}`,
        '',
        escapeHtml(message),
        '',
        'Note: Furby can forward extension commands, skill commands, and prompt-template commands. Some Pi TUI-only built-ins are not available through the SDK prompt API.',
      ].join('\n'));
    }
  }

  return handleCommand;
}
