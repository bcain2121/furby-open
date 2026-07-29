import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createEditToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  type EditOperations,
  type ReadOperations,
  type WriteOperations,
} from '@earendil-works/pi-coding-agent';
import { createProjectAccessPolicy, type ProjectAccessPolicy } from './access-policy.js';

export const DEFAULT_PROJECT_FILE_MAX_BYTES = 10 * 1024 * 1024;

function assertBoundedSize(size: number, maxBytes: number, filePath: string) {
  if (size > maxBytes) {
    throw new Error(`Access denied: ${filePath} exceeds the ${maxBytes}-byte project file limit.`);
  }
}

async function readBoundedFile(
  policy: ProjectAccessPolicy,
  requestedPath: string,
  maxBytes: number,
) {
  const safePath = await policy.resolvePath(requestedPath, 'read');
  const stats = await fs.stat(safePath);
  assertBoundedSize(stats.size, maxBytes, requestedPath);
  return fs.readFile(safePath);
}

function imageMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    '.bmp': 'image/bmp',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  } as Record<string, string | undefined>)[extension];
}

export async function createProjectFileTools(
  projectRoot: string,
  options: { maxBytes?: number } = {},
) {
  const policy = await createProjectAccessPolicy(projectRoot);
  const maxBytes = options.maxBytes ?? DEFAULT_PROJECT_FILE_MAX_BYTES;

  const readOperations: ReadOperations = {
    access: async (requestedPath) => {
      const safePath = await policy.resolvePath(requestedPath, 'read');
      await fs.access(safePath, constants.R_OK);
    },
    readFile: (requestedPath) => readBoundedFile(policy, requestedPath, maxBytes),
    detectImageMimeType: async (requestedPath) => {
      const safePath = await policy.resolvePath(requestedPath, 'read');
      return imageMimeType(safePath);
    },
  };

  const editOperations: EditOperations = {
    access: async (requestedPath) => {
      const safePath = await policy.resolvePath(requestedPath, 'write');
      await fs.access(safePath, constants.R_OK | constants.W_OK);
    },
    readFile: (requestedPath) => readBoundedFile(policy, requestedPath, maxBytes),
    writeFile: async (requestedPath, content) => {
      assertBoundedSize(Buffer.byteLength(content, 'utf8'), maxBytes, requestedPath);
      const safePath = await policy.resolvePath(requestedPath, 'write');
      await fs.writeFile(safePath, content, 'utf8');
    },
  };

  const writeOperations: WriteOperations = {
    mkdir: async (requestedPath) => {
      const safePath = await policy.resolvePath(requestedPath, 'write');
      await fs.mkdir(safePath, { recursive: true });
    },
    writeFile: async (requestedPath, content) => {
      assertBoundedSize(Buffer.byteLength(content, 'utf8'), maxBytes, requestedPath);
      const safePath = await policy.resolvePath(requestedPath, 'write');
      await fs.writeFile(safePath, content, 'utf8');
    },
  };

  return [
    createReadToolDefinition(policy.projectRoot, { operations: readOperations }),
    createEditToolDefinition(policy.projectRoot, { operations: editOperations }),
    createWriteToolDefinition(policy.projectRoot, { operations: writeOperations }),
  ];
}
