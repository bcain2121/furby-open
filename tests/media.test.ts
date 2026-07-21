import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { compactExtractedText, extractTextFromFile } from '../src/media/extract.js';

test('compactExtractedText trims repeated whitespace and truncates long text', () => {
  const compact = compactExtractedText(` hello  \n\n\n\n world ${'x'.repeat(50)}`, 20);
  assert.ok(compact.startsWith('hello\n\n\n world'));
  assert.match(compact, /Truncated to 20 characters/u);
});

test('extractTextFromFile reads plain text files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'furby-media-test-'));
  const filePath = path.join(dir, 'note.txt');
  fs.writeFileSync(filePath, 'hello from file', 'utf8');
  try {
    assert.equal(await extractTextFromFile(filePath, 'text/plain'), 'hello from file');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
