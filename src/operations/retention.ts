import fs from 'node:fs';
import path from 'node:path';

export interface RetentionCandidate {
  path: string;
  category: 'log' | 'session' | 'partial-media';
  sizeBytes: number;
  modifiedAt: string;
}

const RETENTION_DAYS = {
  log: 30,
  session: 90,
  'partial-media': 1,
} as const;

async function walkFiles(root: string): Promise<string[]> {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of await fs.promises.readdir(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile()) files.push(fullPath);
    }
  };
  await walk(root);
  return files;
}

export async function collectRetentionCandidates(rootDir: string, now = new Date()) {
  const locations: Array<{ root: string; category: RetentionCandidate['category']; filter?: (file: string) => boolean }> = [
    { root: path.join(rootDir, 'logs'), category: 'log' },
    { root: path.join(rootDir, '.data', 'sessions'), category: 'session' },
    {
      root: path.join(rootDir, 'furby-open-workspace'),
      category: 'partial-media',
      filter: (file) => /\.(?:partial|tmp)$/iu.test(file),
    },
  ];
  const candidates: RetentionCandidate[] = [];
  for (const location of locations) {
    for (const file of await walkFiles(location.root)) {
      if (location.filter && !location.filter(file)) continue;
      const stat = await fs.promises.stat(file);
      const ageMs = now.getTime() - stat.mtimeMs;
      const thresholdMs = RETENTION_DAYS[location.category] * 24 * 60 * 60 * 1000;
      if (ageMs < thresholdMs) continue;
      candidates.push({
        path: file,
        category: location.category,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }
  }
  return candidates.sort((a, b) => a.path.localeCompare(b.path));
}

export async function applyRetentionCandidates(candidates: RetentionCandidate[]) {
  for (const candidate of candidates) await fs.promises.rm(candidate.path, { force: true });
  return {
    removedFiles: candidates.length,
    removedBytes: candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0),
  };
}
