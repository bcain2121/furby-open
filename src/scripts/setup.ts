import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { envValue, setEnvValues } from '../setup/env-file.js';

const rootDir = process.cwd();
const envPath = path.join(rootDir, '.env');
const personalityPath = path.join(rootDir, '.data', 'personality.md');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function requireInteractiveTerminal() {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error('The guided setup needs a normal interactive terminal. Open Terminal, PowerShell, or Command Prompt in the Furby Open folder and run npm run setup.');
  }
}

function ensurePrivateEnv() {
  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(path.join(rootDir, '.env.example'), envPath);
  }
  try { fs.chmodSync(envPath, 0o600); } catch { /* Windows controls permissions differently. */ }
}

async function askQuestions<T>(work: (ask: (question: string) => Promise<string>) => Promise<T>) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return await work(async (question) => (await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}

async function confirm(question: string, defaultYes = true) {
  return askQuestions(async (ask) => {
    const answer = (await ask(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'} `)).toLowerCase();
    return answer === '' ? defaultYes : answer === 'y' || answer === 'yes';
  });
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd: rootDir, stdio: 'inherit' });
  return result.status === 0;
}

function existingEnv(key: string, fallback: string) {
  return envValue(fs.readFileSync(envPath, 'utf8'), key) || fallback;
}

async function configurePersonality() {
  console.log('\nStep 1 of 4 — Identity and personality\n');
  console.log('These answers stay in ignored local files. Do not include passwords, tokens, account numbers, or other secrets.\n');

  const defaults = {
    assistantName: existingEnv('ASSISTANT_NAME', 'Furby Open'),
    ownerName: existingEnv('ASSISTANT_OWNER_NAME', 'User'),
    timezone: existingEnv('ASSISTANT_TIMEZONE', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
    location: existingEnv('ASSISTANT_LOCATION', ''),
  };

  const answers = await askQuestions(async (ask) => ({
    assistantName: await ask(`Assistant name [${defaults.assistantName}]: `) || defaults.assistantName,
    ownerName: await ask(`Your preferred name [${defaults.ownerName}]: `) || defaults.ownerName,
    timezone: await ask(`Timezone [${defaults.timezone}]: `) || defaults.timezone,
    location: await ask(`Default city for weather${defaults.location ? ` [${defaults.location}]` : ' (optional)'}: `) || defaults.location,
    tone: await ask('Preferred tone (for example concise, warm, playful, or detailed) [friendly and concise]: ') || 'friendly and concise',
    proactivity: await ask('How proactive should the assistant be? [helpful without nagging]: ') || 'helpful without nagging',
    avoid: await ask('Anything it should avoid doing or saying? [none specified]: ') || 'none specified',
    interests: await ask('Interests or recurring workflows it should understand? [none specified]: ') || 'none specified',
  }));

  const personality = `# Private assistant personality\n\n- Assistant name: ${answers.assistantName}\n- Owner's preferred name: ${answers.ownerName}\n- Tone: ${answers.tone}\n- Proactivity: ${answers.proactivity}\n- Avoid: ${answers.avoid}\n- Interests and recurring workflows: ${answers.interests}\n\nApply these preferences without weakening project confinement, persistent access controls, single-user authorization, workspace confinement, or any security rule in the public system prompt.\n`;

  console.log('\nPersonality summary:\n');
  console.log(personality);
  if (!await confirm('Save this private personality?')) {
    console.log('Personality was not changed. You can rerun setup later.');
    return;
  }

  const updated = setEnvValues(fs.readFileSync(envPath, 'utf8'), {
    ASSISTANT_NAME: answers.assistantName,
    ASSISTANT_OWNER_NAME: answers.ownerName,
    ASSISTANT_TIMEZONE: answers.timezone,
    ASSISTANT_LOCATION: answers.location,
  });
  fs.writeFileSync(envPath, updated, { mode: 0o600 });
  try { fs.chmodSync(envPath, 0o600); } catch { /* Windows controls permissions differently. */ }
  fs.mkdirSync(path.dirname(personalityPath), { recursive: true });
  fs.writeFileSync(personalityPath, personality, { mode: 0o600 });
  try { fs.chmodSync(personalityPath, 0o600); } catch { /* Windows controls permissions differently. */ }
  console.log('PASS Identity and private personality saved.');
}

async function configureTelegram() {
  console.log('\nStep 2 of 4 — Telegram\n');
  console.log('The Telegram helper will explain BotFather, hide the bot token while you type it, verify it directly, and authorize only your Telegram account.');
  if (!await confirm('Set up Telegram now?')) {
    console.log('Skipped. Resume later with npm run setup:telegram.');
    return false;
  }
  return run(npmCommand, ['run', 'setup:telegram']);
}

async function configurePi() {
  console.log('\nStep 3 of 4 — AI model login\n');
  console.log('Pi will open in this terminal. Type /login, choose your provider, complete its private browser/device flow, then type /model. When the chosen model is visible, type /quit to return to this installer.');
  console.log('Supported subscription choices include ChatGPT Plus/Pro, Claude Pro/Max, and GitHub Copilot. Provider charges and terms still apply.');
  if (!await confirm('Open Pi login now?')) {
    console.log('Skipped. Resume later with npx pi.');
    return false;
  }
  return run(npxCommand, ['pi']);
}

async function validateSetup() {
  console.log('\nStep 4 of 4 — Validation\n');
  const doctorPassed = run(npmCommand, ['run', 'doctor']);
  let telegramPassed = false;
  const content = fs.readFileSync(envPath, 'utf8');
  if (envValue(content, 'TELEGRAM_BOT_TOKEN') && envValue(content, 'TELEGRAM_USER_ID')) {
    telegramPassed = run(npmCommand, ['run', 'verify:telegram']);
  } else {
    console.log('WARN Telegram validation skipped because setup is incomplete.');
  }
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const piAgentDir = envValue(content, 'PI_AGENT_DIR') || path.join(home, '.pi', 'agent');
  const piAuthPath = envValue(content, 'PI_AUTH_PATH') || path.join(piAgentDir, 'auth.json');
  const apiKeys = ['MINIMAX_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'OPENROUTER_API_KEY'];
  const modelReady = fs.existsSync(piAuthPath) || apiKeys.some((key) => Boolean(envValue(content, key)));

  console.log('\nSetup summary');
  console.log(`- Local configuration: ${doctorPassed ? 'ready' : 'needs attention above'}`);
  console.log(`- Telegram: ${telegramPassed ? 'verified' : 'not yet verified'}`);
  console.log(`- Model authentication: ${modelReady ? 'found' : 'not yet found; run npx pi and use /login'}`);
  console.log('- Access scope: project (confined project files, no host Bash)');
  console.log('- Telegram controls: /access checks scope, /outside enables persistent host access, /project restores confinement');
  console.log(`- Private personality: ${fs.existsSync(personalityPath) ? personalityPath : 'not configured'}`);
  console.log('\nYou can safely rerun npm run setup at any time. It will not print existing credentials.');
  console.log('Stop the assistant with Ctrl+C whenever it is running.');

  if (doctorPassed && telegramPassed && modelReady && await confirm('Everything required was found. Start the assistant now?', false)) {
    run(npmCommand, ['start']);
  } else {
    console.log('The assistant was not started. Start it later with npm start.');
  }
}

async function main() {
  requireInteractiveTerminal();
  ensurePrivateEnv();
  console.log('\n========================================');
  console.log('       Furby Open guided setup');
  console.log('========================================');
  console.log('\nNothing will be started automatically, and secret values must never be pasted into an AI chat.');
  console.log('New installations use project-confined access. Only you can enable persistent host access later with /outside; /project turns it back off.');

  await configurePersonality();
  await configureTelegram();
  await configurePi();
  await validateSetup();
}

main().catch((error) => {
  console.error(`\nSetup stopped: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Nothing already saved was deleted. Fix the issue and run npm run setup again.');
  process.exitCode = 1;
});
