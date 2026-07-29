import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractAssistantTextSince } from '../src/runtime/pi-session.js';

const rootDir = process.cwd();

test('public system prompt preserves privacy, skill, and capability boundaries', () => {
  const prompt = fs.readFileSync(path.join(rootDir, 'src', 'config', 'system.md'), 'utf8');
  assert.match(prompt, /Never reveal secret values/u);
  assert.match(prompt, /Only create or modify skills when the owner has asked/u);
  assert.match(prompt, /project-local Pi skill/u);
  assert.match(prompt, /Do not weaken authentication, path confinement, or network binding/u);
  assert.match(prompt, /Only the owner's native .*\/outside.* and .*\/project.* commands/u);
  assert.match(prompt, /Project scope permits reading and writing .*\.env/u);
});

test('pi runtime contains stale-response guard and fresh session reset hooks', () => {
  const runtimeSource = fs.readFileSync(path.join(rootDir, 'src', 'runtime', 'pi-session.ts'), 'utf8');
  assert.match(runtimeSource, /freshSessionKeys/u);
  assert.match(runtimeSource, /SessionManager\.create\(config\.rootDir, sessionDir\)/u);
  assert.match(runtimeSource, /messageStartIndex/u);
  assert.match(runtimeSource, /did not return a new response/u);
  assert.match(runtimeSource, /\.data', 'personality\.md/u);
  assert.match(runtimeSource, /resetAccessScope/u);
  assert.match(runtimeSource, /activeSessions\.map\(\(session\) => session\.abort\(\)\)/u);
});

test('assistant response extraction never returns text from before the current prompt', () => {
  const messages: any[] = [
    { role: 'user', content: 'old question' },
    { role: 'assistant', content: 'old answer' },
    { role: 'user', content: 'new question' },
  ];
  assert.equal(extractAssistantTextSince(messages, 2), '');
  messages.push({ role: 'assistant', content: [{ type: 'text', text: 'new answer' }] });
  assert.equal(extractAssistantTextSince(messages, 2), 'new answer');
});

test('public defaults use persistent project scope and disable A2A', () => {
  const envSource = fs.readFileSync(path.join(rootDir, 'src', 'config', 'env.ts'), 'utf8');
  const preferenceSource = fs.readFileSync(path.join(rootDir, 'src', 'storage', 'preferences.ts'), 'utf8');
  assert.doesNotMatch(envSource, /FURBY_OPEN_TOOL_MODE:/u);
  assert.match(envSource, /FURBY_OPEN_A2A_ENABLED[\s\S]*\? false/u);
  assert.match(preferenceSource, /accessScope.*\?\? 'project'/u);
});

test('Pi smoke test preserves a failing exit status', () => {
  const source = fs.readFileSync(path.join(rootDir, 'src', 'scripts', 'smoke-pi.ts'), 'utf8');
  assert.match(source, /process\.exitCode = 1/u);
  assert.doesNotMatch(source, /process\.exit\(0\)/u);
});

test('Telegram transport does not block polling while an interactive model run is active', () => {
  const source = fs.readFileSync(path.join(rootDir, 'src', 'bot', 'telegram.ts'), 'utf8');
  assert.match(source, /function startInteractive/u);
  assert.doesNotMatch(source, /await submitInteractive\(/u);
});
