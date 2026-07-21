import fs from 'node:fs';
import path from 'node:path';

function isWithinRoot(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function nearestExistingPath(candidate: string) {
  let current = candidate;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

export function resolvePathWithinRoot(rootPath: string, inputPath: string) {
  const root = path.resolve(rootPath);
  fs.mkdirSync(root, { recursive: true });

  const candidate = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(root, inputPath);
  if (!isWithinRoot(root, candidate)) {
    throw new Error('Path escapes the configured workspace.');
  }

  const realRoot = fs.realpathSync(root);
  const existingAncestor = nearestExistingPath(candidate);
  const realAncestor = fs.realpathSync(existingAncestor);
  if (!isWithinRoot(realRoot, realAncestor)) {
    throw new Error('Path escapes the configured workspace through a symbolic link.');
  }

  if (fs.existsSync(candidate)) {
    const realCandidate = fs.realpathSync(candidate);
    if (!isWithinRoot(realRoot, realCandidate)) {
      throw new Error('Path escapes the configured workspace through a symbolic link.');
    }
  }

  return candidate;
}

export function relativePathWithinRoot(rootPath: string, absolutePath: string) {
  const resolved = resolvePathWithinRoot(rootPath, absolutePath);
  return path.relative(path.resolve(rootPath), resolved);
}
