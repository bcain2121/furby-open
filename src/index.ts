import fs from 'node:fs';
import path from 'node:path';
import { FurbyA2AService } from './a2a/service.js';
import { createTelegramBot } from './bot/telegram.js';
import { config, validateRuntimeConfig } from './config/env.js';
import { ensureTelegramUser, openDatabase } from './db/database.js';
import { FurbyPiRuntime } from './runtime/pi-session.js';
import { FurbyScheduler } from './scheduler/runner.js';
import { PreferenceStore } from './storage/preferences.js';

const issues = validateRuntimeConfig();
if (issues.length > 0) {
  console.error('Configuration errors:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

fs.mkdirSync(path.join(config.rootDir, '.data'), { recursive: true });
const db = openDatabase();
ensureTelegramUser(db, config.telegramUserId, config.ownerName);
db.close();

const runtime = new FurbyPiRuntime();
const preferences = new PreferenceStore(path.join(config.rootDir, '.data', 'preferences.json'));
const bot = createTelegramBot(runtime, preferences);
const scheduler = new FurbyScheduler(bot, runtime, preferences);
const skills = config.a2aEnabled ? await runtime.listSkills(500) : [];
const a2a = config.a2aEnabled ? new FurbyA2AService(runtime, {
  hostname: config.a2aHostname,
  port: config.a2aPort,
  taskDir: config.a2aDir,
  userId: config.telegramUserId,
  modelName: config.defaultModel,
  maxConcurrency: config.a2aMaxConcurrency,
  agentName: config.name,
  skills: skills.map((skill) => skill.name),
}) : null;

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal}`);
  scheduler.stop();
  bot.disposeInteractiveBroker();
  await a2a?.stop().catch((error) => console.error('[shutdown] A2A stop failed', error));
  runtime.dispose();
  await bot.stop().catch(() => undefined);
  process.exit(0);
}

process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

console.log(`[start] ${config.name}`);
console.log(`[start] model=${config.defaultModel} fallback=${config.fallbackModel} accessScope=${preferences.getAccessScope(config.telegramUserId)}`);
if (a2a) await a2a.start();
scheduler.start();
await bot.start();
