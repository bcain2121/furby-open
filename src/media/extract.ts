import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function extractTextFromFile(filePath: string, mimeType = '') {
  const lower = filePath.toLowerCase();
  if (mimeType.startsWith('text/') || /\.(txt|md|csv|json|html|xml|log)$/u.test(lower)) {
    return fs.promises.readFile(filePath, 'utf8');
  }

  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
    const outputPath = path.join(os.tmpdir(), `furby-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
    try {
      await execFileAsync('pdftotext', ['-layout', filePath, outputPath], {
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 8,
      });
      return await fs.promises.readFile(outputPath, 'utf8');
    } finally {
      await fs.promises.rm(outputPath, { force: true });
    }
  }

  throw new Error(`No text extractor available for ${mimeType || path.extname(filePath) || 'this file type'}.`);
}

export function compactExtractedText(text: string, maxChars = 20000) {
  const cleaned = text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{4,}/gu, '\n\n\n')
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars)}\n\n[Truncated to ${maxChars} characters from ${cleaned.length}. Ask for a narrower extraction if needed.]`;
}
