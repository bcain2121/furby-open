import fs from 'node:fs';
import path from 'node:path';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { config } from '../config/env.js';
import { relativePathWithinRoot, resolvePathWithinRoot } from '../storage/vault-path.js';

const vaultRoot = config.mobileVaultRoot;
const MAX_VAULT_WRITE_BYTES = 1024 * 1024;
const MAX_VAULT_READ_BYTES = 100_000;
const MAX_SEARCH_FILE_BYTES = 256_000;
const MAX_SEARCH_TOTAL_BYTES = 5 * 1024 * 1024;

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: 'text' as const, text }], details };
}

export function resolveVaultPath(inputPath: string) {
  return resolvePathWithinRoot(vaultRoot, inputPath);
}

export function vaultRelativePath(absolutePath: string) {
  return relativePathWithinRoot(vaultRoot, absolutePath);
}

function ensureMarkdownPath(inputPath: string) {
  return /\.[a-z0-9]+$/iu.test(inputPath) ? inputPath : `${inputPath}.md`;
}

async function listVaultFiles(directory = '.', recursive = true, maxResults = 50) {
  const start = resolveVaultPath(directory);
  if (!fs.existsSync(start)) return [];
  const results: string[] = [];
  const limit = Math.max(1, Math.min(maxResults, 500));
  const walk = async (current: string): Promise<void> => {
    for (const entry of await fs.promises.readdir(current, { withFileTypes: true })) {
      if (results.length >= limit) return;
      if (entry.name === '.obsidian' || entry.name === 'telegram' || entry.isSymbolicLink()) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (recursive) await walk(full);
      } else {
        results.push(vaultRelativePath(full));
      }
    }
  };
  const stat = await fs.promises.stat(start);
  if (stat.isDirectory()) await walk(start);
  else results.push(vaultRelativePath(start));
  return results.slice(0, limit);
}

async function searchVault(query: string, maxResults = 20) {
  const terms = query.toLowerCase().split(/\s+/u).filter(Boolean);
  const files = (await listVaultFiles('.', true, 500)).filter((file) => /\.(md|txt|json|csv)$/iu.test(file));
  const matches: Array<{ path: string; score: number; snippet: string }> = [];
  let searchedBytes = 0;
  for (const file of files) {
    const fullPath = resolveVaultPath(file);
    const stat = await fs.promises.stat(fullPath);
    if (stat.size > MAX_SEARCH_FILE_BYTES || searchedBytes + stat.size > MAX_SEARCH_TOTAL_BYTES) continue;
    searchedBytes += stat.size;
    const text = await fs.promises.readFile(fullPath, 'utf8');
    const lower = text.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
    if (score > 0) {
      const indexes = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0);
      const firstIndex = Math.max(0, (indexes.length ? Math.min(...indexes) : 0) - 80);
      matches.push({ path: file, score, snippet: text.slice(firstIndex, firstIndex + 300).replace(/\s+/gu, ' ').trim() });
    }
  }
  return {
    matches: matches.sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(maxResults, 100))),
    searchedBytes,
    searchedFiles: files.length,
  };
}

function assertWriteSize(content: string) {
  if (Buffer.byteLength(content, 'utf8') > MAX_VAULT_WRITE_BYTES) {
    throw new Error(`Vault write exceeds the ${MAX_VAULT_WRITE_BYTES}-byte limit.`);
  }
}

export function createVaultTools() {
  return [
    defineTool({
      name: 'furby_vault_write',
      label: 'Write Workspace Note',
      description: `Write a note/file to the configured workspace. Use when ${config.ownerName} says save this to the workspace or make a note.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
          overwrite: { type: 'boolean', default: false },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const content = String(params.content);
        assertWriteSize(content);
        const notePath = ensureMarkdownPath(String(params.path));
        const absolutePath = resolveVaultPath(notePath);
        if (fs.existsSync(absolutePath) && !params.overwrite) throw new Error('Vault file already exists. Set overwrite=true to replace it.');
        await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.promises.writeFile(absolutePath, content, 'utf8');
        return textResult(`Wrote ${vaultRelativePath(absolutePath)}.`, { path: vaultRelativePath(absolutePath) });
      },
    }),
    defineTool({
      name: 'furby_vault_append',
      label: 'Append Workspace Note',
      description: 'Append text to a note/file in configured workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, content: { type: 'string' } },
        required: ['path', 'content'],
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const content = String(params.content);
        assertWriteSize(content);
        const notePath = ensureMarkdownPath(String(params.path));
        const absolutePath = resolveVaultPath(notePath);
        await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.promises.appendFile(absolutePath, `${content}\n`, 'utf8');
        return textResult(`Appended to ${vaultRelativePath(absolutePath)}.`, { path: vaultRelativePath(absolutePath) });
      },
    }),
    defineTool({
      name: 'furby_vault_read',
      label: 'Read Workspace Note',
      description: 'Read a note/file from configured workspace.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' }, maxBytes: { type: 'number', default: 20000 } },
        required: ['path'],
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const absolutePath = resolveVaultPath(String(params.path));
        const maxBytes = Math.max(1, Math.min(Number(params.maxBytes ?? 20000), MAX_VAULT_READ_BYTES));
        const handle = await fs.promises.open(absolutePath, 'r');
        try {
          const buffer = Buffer.alloc(maxBytes);
          const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
          return textResult(buffer.subarray(0, bytesRead).toString('utf8'), { path: vaultRelativePath(absolutePath), bytesRead });
        } finally {
          await handle.close();
        }
      },
    }),
    defineTool({
      name: 'furby_vault_search',
      label: 'Search Workspace',
      description: 'Search markdown/text files in configured workspace.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, maxResults: { type: 'number', default: 20 } },
        required: ['query'],
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const result = await searchVault(String(params.query), Number(params.maxResults ?? 20));
        return textResult(JSON.stringify(result.matches, null, 2), {
          count: result.matches.length,
          searchedBytes: result.searchedBytes,
          searchedFiles: result.searchedFiles,
        });
      },
    }),
    defineTool({
      name: 'furby_vault_list',
      label: 'List Workspace Files',
      description: 'List files in configured workspace.',
      parameters: {
        type: 'object',
        properties: {
          directory: { type: 'string', default: '.' },
          recursive: { type: 'boolean', default: true },
          maxResults: { type: 'number', default: 50 },
        },
        additionalProperties: false,
      },
      execute: async (_toolCallId: string, params: any) => {
        const files = await listVaultFiles(String(params.directory ?? '.'), Boolean(params.recursive ?? true), Number(params.maxResults ?? 50));
        return textResult(JSON.stringify(files, null, 2), { count: files.length });
      },
    }),
  ];
}
