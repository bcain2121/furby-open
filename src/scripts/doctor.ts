import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { config } from '../config/env.js';
import { defaultDbPath, openDatabase } from '../db/database.js';
import { detectExternalAgents, discoverExternalSkills, externalSkillSources } from '../skills/external-skill-importer.js';

let failures = 0;
let warnings = 0;

function pass(message: string) { console.log(`PASS ${message}`); }
function warn(message: string) { warnings += 1; console.log(`WARN ${message}`); }
function fail(message: string) { failures += 1; console.log(`FAIL ${message}`); }

function hasCommand(command: string) {
  const locator = process.platform === 'win32' ? 'where.exe' : 'which';
  return spawnSync(locator, [command], { encoding: 'utf8', windowsHide: true }).status === 0;
}

function looksPlaceholder(value: string) {
  return !value || /^(your_|changeme|optional|todo|xxx|placeholder)/iu.test(value) || value.includes('*******');
}

function checkWritableDir(dir: string, label: string) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.doctor-${Date.now()}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    pass(`${label} writable: ${dir}`);
  } catch (error) {
    fail(`${label} is not writable: ${dir} (${error instanceof Error ? error.message : String(error)})`);
  }
}

console.log(`${config.name} doctor\n`);

if (fs.existsSync(path.join(config.rootDir, '.env'))) pass('.env exists');
else warn('.env missing; copy .env.example to .env');

if (looksPlaceholder(config.telegramBotToken)) fail('TELEGRAM_BOT_TOKEN missing or placeholder');
else pass('TELEGRAM_BOT_TOKEN configured');

if (config.telegramUserId > 0) pass(`TELEGRAM_USER_ID configured: ${config.telegramUserId}`);
else fail('TELEGRAM_USER_ID must be a numeric Telegram user id');

checkWritableDir(path.join(config.rootDir, '.data'), '.data');
checkWritableDir(config.sessionRoot, 'PI_SESSION_ROOT');
checkWritableDir(config.mobileVaultRoot, 'MOBILE_WORKSPACE_ROOT');
if (config.a2aEnabled) {
  checkWritableDir(config.a2aDir, 'FURBY_OPEN_A2A_DIR');
  pass(`A2A listener configured: ${config.a2aHostname}:${config.a2aPort}`);
} else {
  warn('A2A listener is disabled by FURBY_OPEN_A2A_ENABLED');
}

try {
  const disk = fs.statfsSync(config.rootDir);
  const freeBytes = Number(disk.bavail) * Number(disk.bsize);
  const totalBytes = Number(disk.blocks) * Number(disk.bsize);
  const freePercent = totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0;
  const summary = `${(freeBytes / 1024 ** 3).toFixed(1)} GiB free (${freePercent.toFixed(1)}%)`;
  if (freePercent < 10) warn(`Low disk space: ${summary}`);
  else pass(`Disk space: ${summary}`);
} catch (error) {
  warn(`Could not inspect disk space: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const db = openDatabase(defaultDbPath);
  const integrity = db.pragma('quick_check', { simple: true });
  const migration = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number | null };
  db.close();
  if (integrity === 'ok') pass(`SQLite quick_check passed; schema version ${migration.version ?? 0}`);
  else fail(`SQLite quick_check failed: ${String(integrity)}`);
} catch (error) {
  fail(`SQLite health check failed: ${error instanceof Error ? error.message : String(error)}`);
}

if (fs.existsSync(config.piAgentDir)) pass(`Pi agent dir exists: ${config.piAgentDir}`);
else warn(`Pi agent dir missing: ${config.piAgentDir}`);

const authPath = config.piAuthPath || path.join(config.piAgentDir, 'auth.json');
if (fs.existsSync(authPath)) pass(`Pi auth found: ${authPath}`);
else warn(`Pi auth not found: ${authPath}; run pi then /login if using OAuth-backed providers`);

const settingsPath = path.join(config.piAgentDir, 'settings.json');
if (fs.existsSync(settingsPath)) {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as { enabledModels?: unknown };
    const enabled = Array.isArray(settings.enabledModels) ? settings.enabledModels : [];
    if (enabled.length > 0) pass(`Pi enabledModels found: ${enabled.join(', ')}`);
    else warn('Pi settings found but enabledModels is empty');
  } catch (error) {
    warn(`Could not parse Pi settings: ${error instanceof Error ? error.message : String(error)}`);
  }
} else {
  warn(`Pi settings not found: ${settingsPath}`);
}

for (const command of ['node', 'npm']) {
  if (hasCommand(command)) pass(`${command} available`);
  else fail(`${command} missing`);
}
for (const [command, feature] of [['ffmpeg', 'voice/media conversion'], ['pdftotext', 'PDF extraction']] as const) {
  if (hasCommand(command)) pass(`${command} available`);
  else warn(`${command} missing; ${feature} will be unavailable`);
}
for (const command of ['cmake', 'make', 'gcc', 'g++', 'pm2', 'pi']) {
  if (hasCommand(command)) pass(`${command} available`);
  else warn(`${command} missing or not on PATH`);
}

for (const agent of detectExternalAgents()) {
  if (agent.installed) pass(`${agent.name} detected: ${agent.executablePath}`);
  else warn(`${agent.name} not detected; external skill import from that agent is still possible if its skill directory exists`);
}
try {
  const skillSources = externalSkillSources().filter((source) => source.exists);
  const externalSkills = discoverExternalSkills();
  const compatibleExternalSkills = externalSkills.filter((skill) => skill.compatible);
  if (skillSources.length > 0) {
    pass(`External skill directories found: ${skillSources.map((source) => source.label).join(', ')}`);
  }
  if (compatibleExternalSkills.length > 0) {
    warn(`${compatibleExternalSkills.length} compatible external skill(s) available; review with npm run skills:import -- --list`);
  }
} catch (error) {
  warn(`Could not inspect external agent skills: ${error instanceof Error ? error.message : String(error)}`);
}

if (config.transcriptionProvider === 'local') {
  if (fs.existsSync(config.whisperCppBin)) pass(`whisper.cpp binary found: ${config.whisperCppBin}`);
  else warn(`whisper.cpp binary missing: ${config.whisperCppBin}; run scripts/setup-local-whisper.sh`);
  if (fs.existsSync(config.whisperCppModel)) pass(`whisper.cpp model found: ${config.whisperCppModel}`);
  else warn(`whisper.cpp model missing: ${config.whisperCppModel}; run scripts/setup-local-whisper.sh`);
} else if (looksPlaceholder(config.openaiApiKey)) {
  fail('TRANSCRIPTION_PROVIDER=openai but OPENAI_API_KEY is missing or placeholder');
}

console.log(`\nDoctor complete: ${failures} failure(s), ${warnings} warning(s).`);
process.exit(failures > 0 ? 1 : 0);
