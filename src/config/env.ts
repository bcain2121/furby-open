import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import dotenv from 'dotenv';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = process.env.FURBY_OPEN_ROOT_DIR
  ? path.resolve(process.env.FURBY_OPEN_ROOT_DIR)
  : path.resolve(moduleDir, '..', '..');
const envPath = path.join(rootDir, '.env');
const userHome = process.env.HOME || process.env.USERPROFILE || '';
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
else dotenv.config();

const boolFromString = z
  .string()
  .optional()
  .transform((value) => ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase()));

const schema = z.object({
  ASSISTANT_NAME: z.string().default('Furby Open'),
  ASSISTANT_OWNER_NAME: z.string().default('User'),
  ASSISTANT_TIMEZONE: z.string().default('UTC'),
  ASSISTANT_LOCATION: z.string().default(''),
  MOBILE_WORKSPACE_ROOT: z.string().default('furby-open-workspace'),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_USER_ID: z.string().default(''),
  DEFAULT_MODEL: z.string().default('openai-codex/gpt-5.6-sol'),
  FALLBACK_MODEL: z.string().default('minimax/MiniMax-M3'),
  MINIMAX_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  PI_AUTH_PATH: z.string().optional(),
  PI_AGENT_DIR: z.string().optional(),
  PI_MODELS_PATH: z.string().optional(),
  PI_THINKING_LEVEL: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh']).default('medium'),
  PI_PROMPT_TIMEOUT_SECONDS: z.coerce.number().int().min(30).max(3600).default(900),
  PI_SESSION_ROOT: z.string().default('.data/sessions'),
  FURBY_OPEN_LOAD_GLOBAL_SKILLS: z.string().optional().transform((value) => value === undefined
    ? false
    : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())),
  FURBY_OPEN_TOOL_MODE: z.enum(['safe', 'coding']).default('safe'),
  TELEGRAM_COALESCE_MS: z.coerce.number().int().min(0).max(10_000).default(800),
  FURBY_OPEN_A2A_ENABLED: z.string().optional().transform((value) => value === undefined
    ? false
    : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())),
  FURBY_OPEN_A2A_HOSTNAME: z.string().default('127.0.0.1'),
  FURBY_OPEN_A2A_PORT: z.coerce.number().int().min(0).max(65_535).default(3013),
  FURBY_OPEN_A2A_DIR: z.string().default('.data/a2a'),
  FURBY_OPEN_A2A_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  SHOW_THINKING_STREAM: boolFromString,
  TRANSCRIPTION_PROVIDER: z.enum(['local', 'openai']).default('local'),
  WHISPER_CPP_BIN: z.string().optional(),
  WHISPER_CPP_MODEL: z.string().optional(),
});

const parsed = schema.parse(process.env);
const telegramUserId = Number.parseInt(parsed.TELEGRAM_USER_ID, 10);

export const config = {
  rootDir,
  name: parsed.ASSISTANT_NAME,
  ownerName: parsed.ASSISTANT_OWNER_NAME,
  assistantTimezone: parsed.ASSISTANT_TIMEZONE,
  assistantLocation: parsed.ASSISTANT_LOCATION,
  mobileVaultRoot: path.resolve(rootDir, parsed.MOBILE_WORKSPACE_ROOT),
  telegramBotToken: parsed.TELEGRAM_BOT_TOKEN,
  telegramUserId: Number.isFinite(telegramUserId) ? telegramUserId : 0,
  defaultModel: parsed.DEFAULT_MODEL,
  fallbackModel: parsed.FALLBACK_MODEL,
  minimaxApiKey: parsed.MINIMAX_API_KEY ?? '',
  openaiApiKey: parsed.OPENAI_API_KEY ?? '',
  anthropicApiKey: parsed.ANTHROPIC_API_KEY ?? '',
  googleApiKey: parsed.GOOGLE_GENERATIVE_AI_API_KEY ?? '',
  openrouterApiKey: parsed.OPENROUTER_API_KEY ?? '',
  piAuthPath: parsed.PI_AUTH_PATH || undefined,
  piAgentDir: parsed.PI_AGENT_DIR || path.join(userHome, '.pi', 'agent'),
  piModelsPath: parsed.PI_MODELS_PATH || undefined,
  piThinkingLevel: parsed.PI_THINKING_LEVEL,
  piPromptTimeoutSeconds: parsed.PI_PROMPT_TIMEOUT_SECONDS,
  sessionRoot: path.resolve(rootDir, parsed.PI_SESSION_ROOT),
  loadGlobalSkills: parsed.FURBY_OPEN_LOAD_GLOBAL_SKILLS,
  toolMode: parsed.FURBY_OPEN_TOOL_MODE,
  telegramCoalesceMs: parsed.TELEGRAM_COALESCE_MS,
  a2aEnabled: parsed.FURBY_OPEN_A2A_ENABLED,
  a2aHostname: parsed.FURBY_OPEN_A2A_HOSTNAME,
  a2aPort: parsed.FURBY_OPEN_A2A_PORT,
  a2aDir: path.resolve(rootDir, parsed.FURBY_OPEN_A2A_DIR),
  a2aMaxConcurrency: parsed.FURBY_OPEN_A2A_MAX_CONCURRENCY,
  showThinkingStream: parsed.SHOW_THINKING_STREAM,
  transcriptionProvider: parsed.TRANSCRIPTION_PROVIDER,
  whisperCppBin: parsed.WHISPER_CPP_BIN || path.join(rootDir, '.data', 'local', 'whisper.cpp', 'build', 'bin', 'whisper-cli'),
  whisperCppModel: parsed.WHISPER_CPP_MODEL || path.join(rootDir, '.data', 'local', 'whisper.cpp', 'models', 'ggml-tiny.en.bin'),
};

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function isLoopbackHostname(hostname: string) {
  return ['127.0.0.1', '::1', 'localhost'].includes(hostname.toLowerCase());
}

export function validateRuntimeConfig() {
  const issues: string[] = [];
  if (!config.telegramBotToken) issues.push('TELEGRAM_BOT_TOKEN is required.');
  if (!config.telegramUserId) issues.push('TELEGRAM_USER_ID must be a numeric Telegram user id.');
  if (!isValidTimeZone(config.assistantTimezone)) {
    issues.push('ASSISTANT_TIMEZONE must be a valid IANA timezone such as UTC or America/New_York.');
  }
  if (config.a2aEnabled && !isLoopbackHostname(config.a2aHostname)) {
    issues.push('FURBY_OPEN_A2A_HOSTNAME must remain loopback-only because the A2A protocol is unauthenticated.');
  }
  return issues;
}
