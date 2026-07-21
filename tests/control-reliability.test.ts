import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractAssistantTextSince } from '../src/runtime/pi-session.js';

const rootDir = process.cwd();

test('public system prompt preserves privacy, skill, and capability boundaries', () => {
  const prompt = fs.readFileSync(path.join(rootDir, 'src', 'config', 'system.md'), 'utf8');
  assert.match(prompt, /Never reveal secret values/u);
  assert.match(prompt, /Only create or modify skills when coding mode is active/u);
  assert.match(prompt, /project-local Pi skill/u);
  assert.match(prompt, /Do not weaken authentication, path confinement, or network binding/u);
});

test('pi runtime contains stale-response guard and fresh session reset hooks', () => {
  const runtimeSource = fs.readFileSync(path.join(rootDir, 'src', 'runtime', 'pi-session.ts'), 'utf8');
  assert.match(runtimeSource, /freshSessionKeys/u);
  assert.match(runtimeSource, /SessionManager\.create\(config\.rootDir, sessionDir\)/u);
  assert.match(runtimeSource, /messageStartIndex/u);
  assert.match(runtimeSource, /did not return a new response/u);
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

test('public defaults use safe mode and disable A2A', () => {
  const envSource = fs.readFileSync(path.join(rootDir, 'src', 'config', 'env.ts'), 'utf8');
  assert.match(envSource, /FURBY_OPEN_TOOL_MODE:[\s\S]*default\('safe'\)/u);
  assert.match(envSource, /FURBY_OPEN_A2A_ENABLED[\s\S]*\? false/u);
});
