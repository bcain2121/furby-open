import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { stdin, stdout } from 'node:process';
import { envValue, setEnvValues } from '../setup/env-file.js';

interface TelegramUser {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(moduleDir, '..', '..');
const envPath = path.join(rootDir, '.env');
const exampleEnvPath = path.join(rootDir, '.env.example');

function readEnvFile() {
  if (!fs.existsSync(envPath)) {
    fs.copyFileSync(exampleEnvPath, envPath);
    fs.chmodSync(envPath, 0o600);
  }
  return fs.readFileSync(envPath, 'utf8');
}

async function hiddenPrompt(label: string) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('This secure prompt needs an interactive terminal. Run npm run setup:telegram in your own terminal window.');
  }
  stdout.write(label);
  stdin.setEncoding('utf8');
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = '';
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    const onData = (chunk: string | Buffer) => {
      const text = String(chunk);
      for (const character of text) {
        if (character === '\u0003') {
          finish();
          reject(new Error('Setup cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          resolve(value.trim());
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= ' ') value += character;
      }
    };
    stdin.on('data', onData);
  });
}

async function telegramApi<T>(token: string, method: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error('Could not reach the Telegram API. Check your connection and try again.');
  }
  const payload = await response.json() as TelegramApiResponse<T>;
  if (!response.ok || !payload.ok || payload.result === undefined) {
    throw new Error(payload.description || `Telegram API returned HTTP ${response.status}.`);
  }
  return payload.result;
}

function userLabel(user: TelegramUser) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Telegram user';
  return `${name}${user.username ? ` (@${user.username})` : ''} — ID ${user.id}`;
}

async function verify(token: string, userId: number) {
  const bot = await telegramApi<{ username?: string; first_name?: string }>(token, 'getMe');
  console.log(`PASS Telegram bot authenticated: @${bot.username ?? bot.first_name ?? 'unknown'}`);
  try {
    const chat = await telegramApi<{ id: number; first_name?: string; last_name?: string; username?: string }>(token, `getChat?chat_id=${userId}`);
    console.log(`PASS Authorized Telegram user reachable: ${userLabel({
      id: chat.id,
      firstName: chat.first_name ?? '',
      lastName: chat.last_name ?? '',
      username: chat.username ?? '',
    })}`);
  } catch (error) {
    throw new Error(`The bot token works, but user ${userId} is not reachable. Open the bot in Telegram, send /start, and retry. ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function configure() {
  readEnvFile();
  console.log([
    'Furby Open Telegram setup',
    '',
    'This local prompt hides your token and writes it directly to .env.',
    'Do not paste the token into an AI-agent chat.',
    '',
    'In Telegram:',
    '1. Open the verified @BotFather account.',
    '2. Send /newbot.',
    '3. Choose a display name and a unique username ending in bot.',
    '4. Copy the new token BotFather gives you.',
    '',
  ].join('\n'));

  const token = await hiddenPrompt('Paste the new Telegram bot token here (input hidden): ');
  if (!token) throw new Error('No token entered.');
  const bot = await telegramApi<{ username?: string; first_name?: string }>(token, 'getMe');
  if (!bot.username) throw new Error('Telegram authenticated the token, but the bot has no username.');
  console.log(`\nToken verified for @${bot.username}.`);
  console.log(`Open https://t.me/${bot.username} in Telegram and send /start.`);

  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    await prompt.question('After you have sent /start, press Enter here: ');
    const updates = await telegramApi<Array<{
      message?: {
        from?: { id: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean };
        chat?: { type?: string };
      };
    }>>(token, 'getUpdates?timeout=3');
    const users = new Map<number, TelegramUser>();
    for (const update of updates) {
      const from = update.message?.from;
      if (!from || from.is_bot || update.message?.chat?.type !== 'private') continue;
      users.set(from.id, {
        id: from.id,
        firstName: from.first_name ?? '',
        lastName: from.last_name ?? '',
        username: from.username ?? '',
      });
    }
    const choices = [...users.values()];
    if (choices.length === 0) throw new Error(`No private /start message was found for @${bot.username}. Send /start, wait a moment, and run setup again.`);

    let selected = choices[0];
    if (choices.length > 1) {
      console.log('\nMore than one Telegram user has messaged this bot:');
      choices.forEach((user, index) => console.log(`${index + 1}. ${userLabel(user)}`));
      const answer = await prompt.question('Choose your user number: ');
      selected = choices[Number.parseInt(answer, 10) - 1];
      if (!selected) throw new Error('Invalid user selection.');
    }
    const confirmation = await prompt.question(`Authorize only ${userLabel(selected)}? Type YES: `);
    if (confirmation !== 'YES') throw new Error('Authorization was not confirmed.');

    const updated = setEnvValues(readEnvFile(), {
      TELEGRAM_BOT_TOKEN: token,
      TELEGRAM_USER_ID: selected.id,
    });
    fs.writeFileSync(envPath, updated, { mode: 0o600 });
    fs.chmodSync(envPath, 0o600);
    console.log('\nTelegram credentials saved privately in .env. The token was not printed.');
    await verify(token, selected.id);
  } finally {
    prompt.close();
  }
}

async function main() {
  if (process.argv.includes('--verify')) {
    if (!fs.existsSync(envPath)) throw new Error('Telegram is not configured. Run npm run setup:telegram first.');
    const content = fs.readFileSync(envPath, 'utf8');
    const token = envValue(content, 'TELEGRAM_BOT_TOKEN');
    const userId = Number.parseInt(envValue(content, 'TELEGRAM_USER_ID'), 10);
    if (!token || !Number.isFinite(userId)) throw new Error('Telegram is not configured. Run npm run setup:telegram first.');
    await verify(token, userId);
    return;
  }
  await configure();
}

try {
  await main();
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
