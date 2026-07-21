import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export type ExternalAgentSource = 'codex' | 'claude-code' | 'agent-skills';

export interface ExternalAgentDetection {
  name: 'Codex CLI' | 'Claude Code';
  command: 'codex' | 'claude';
  executablePath: string | null;
  installed: boolean;
}

export interface ExternalSkillSource {
  id: ExternalAgentSource;
  label: string;
  root: string;
  exists: boolean;
}

export interface ExternalSkillCandidate {
  id: string;
  source: ExternalAgentSource;
  sourceLabel: string;
  sourceRoot: string;
  skillRoot: string;
  relativePath: string;
  name: string;
  description: string;
  compatible: boolean;
  errors: string[];
  warnings: string[];
  fileCount: number;
  sizeBytes: number;
}

export interface ImportResult {
  candidate: ExternalSkillCandidate;
  status: 'imported' | 'skipped' | 'replaced';
  destination: string;
  reason?: string;
}

const MAX_DISCOVERY_DEPTH = 5;
const MAX_SKILL_FILES = 200;
const MAX_SKILL_BYTES = 20 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 5 * 1024 * 1024;
const VALID_SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const EXCLUDED_DIRECTORY_NAMES = new Set(['.git', 'node_modules', '__pycache__']);

function executableCandidates(command: string, env: NodeJS.ProcessEnv) {
  const pathValue = env.PATH ?? '';
  const extensions = process.platform === 'win32'
    ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];
  return pathValue.split(path.delimiter).flatMap((directory) => (
    extensions.map((extension) => path.join(directory, `${command}${extension.toLowerCase()}`))
  ));
}

export function findExecutable(command: string, env: NodeJS.ProcessEnv = process.env) {
  for (const candidate of executableCandidates(command, env)) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Continue through PATH entries.
    }
  }
  return null;
}

export function detectExternalAgents(env: NodeJS.ProcessEnv = process.env): ExternalAgentDetection[] {
  const agents: Array<Omit<ExternalAgentDetection, 'installed'>> = [
    { name: 'Codex CLI', command: 'codex', executablePath: findExecutable('codex', env) },
    { name: 'Claude Code', command: 'claude', executablePath: findExecutable('claude', env) },
  ];
  return agents.map((agent) => ({ ...agent, installed: Boolean(agent.executablePath) }));
}

export function externalSkillSources(homeDir = os.homedir()): ExternalSkillSource[] {
  const definitions: Array<Omit<ExternalSkillSource, 'exists'>> = [
    { id: 'codex', label: 'Codex personal skills', root: path.join(homeDir, '.codex', 'skills') },
    { id: 'claude-code', label: 'Claude Code personal skills', root: path.join(homeDir, '.claude', 'skills') },
    { id: 'agent-skills', label: 'Shared Agent Skills', root: path.join(homeDir, '.agents', 'skills') },
  ];
  return definitions.map((source) => ({ ...source, exists: fs.existsSync(source.root) }));
}

function parseFrontmatter(skillFile: string) {
  const content = fs.readFileSync(skillFile, 'utf8');
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/u);
  if (!match) return { name: '', description: '', content, error: 'SKILL.md is missing YAML frontmatter.' };
  const values = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/u)) {
    const field = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/u);
    if (!field) continue;
    const raw = field[2];
    const value = ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
      ? raw.slice(1, -1)
      : raw;
    values.set(field[1], value);
  }
  return {
    name: values.get('name') ?? '',
    description: values.get('description') ?? '',
    content,
    error: '',
  };
}

function inspectSkillTree(skillRoot: string) {
  let fileCount = 0;
  let sizeBytes = 0;
  const errors: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (EXCLUDED_DIRECTORY_NAMES.has(entry.name)) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        errors.push(`Symbolic links are not imported: ${path.relative(skillRoot, fullPath)}`);
        continue;
      }
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = fs.statSync(fullPath);
      fileCount += 1;
      sizeBytes += stat.size;
      if (stat.size > MAX_SINGLE_FILE_BYTES) errors.push(`File exceeds 5 MiB: ${path.relative(skillRoot, fullPath)}`);
    }
  };
  walk(skillRoot);
  if (fileCount > MAX_SKILL_FILES) errors.push(`Skill has ${fileCount} files; maximum is ${MAX_SKILL_FILES}.`);
  if (sizeBytes > MAX_SKILL_BYTES) errors.push(`Skill exceeds the ${MAX_SKILL_BYTES}-byte import limit.`);
  return { fileCount, sizeBytes, errors };
}

function compatibilityWarnings(content: string) {
  const warnings: string[] = [];
  if (/\$\{CLAUDE_(?:SKILL|PROJECT)_DIR\}/u.test(content)) warnings.push('Uses Claude-specific path substitutions; review paths after import.');
  if (/^(?:allowed-tools|disallowed-tools|context|agent|disable-model-invocation|user-invocable):/mu.test(content)) {
    warnings.push('Uses Claude-specific frontmatter that Pi may ignore.');
  }
  if (/(?:^|\s)!`[^`]+`/mu.test(content) || /^```!/mu.test(content)) warnings.push('Contains Claude skill shell interpolation; review before use.');
  return warnings;
}

function discoverSkillFiles(sourceRoot: string) {
  const skillFiles: string[] = [];
  const walk = (current: string, depth: number) => {
    if (depth > MAX_DISCOVERY_DEPTH) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      if (entry.name === 'SKILL.md' && entry.isFile()) {
        skillFiles.push(path.join(current, entry.name));
        continue;
      }
      if (!entry.isDirectory() || EXCLUDED_DIRECTORY_NAMES.has(entry.name) || entry.name.startsWith('.')) continue;
      walk(path.join(current, entry.name), depth + 1);
    }
  };
  walk(sourceRoot, 0);
  return skillFiles;
}

export function discoverExternalSkills(homeDir = os.homedir()): ExternalSkillCandidate[] {
  const candidates: ExternalSkillCandidate[] = [];
  for (const source of externalSkillSources(homeDir)) {
    if (!source.exists) continue;
    for (const skillFile of discoverSkillFiles(source.root)) {
      const skillRoot = path.dirname(skillFile);
      const relativePath = path.relative(source.root, skillRoot);
      const parsed = parseFrontmatter(skillFile);
      const tree = inspectSkillTree(skillRoot);
      const errors = [...tree.errors];
      if (parsed.error) errors.push(parsed.error);
      if (!parsed.name) errors.push('Frontmatter requires a name.');
      else if (!VALID_SKILL_NAME.test(parsed.name)) errors.push(`Skill name must match ${VALID_SKILL_NAME.source}.`);
      if (!parsed.description) errors.push('Frontmatter requires a one-line description.');
      const warnings = compatibilityWarnings(parsed.content);
      candidates.push({
        id: `${source.id}:${relativePath.split(path.sep).join('/')}`,
        source: source.id,
        sourceLabel: source.label,
        sourceRoot: source.root,
        skillRoot,
        relativePath,
        name: parsed.name,
        description: parsed.description,
        compatible: errors.length === 0,
        errors,
        warnings,
        fileCount: tree.fileCount,
        sizeBytes: tree.sizeBytes,
      });
    }
  }
  return candidates.sort((a, b) => a.id.localeCompare(b.id));
}

function readManifest(manifestPath: string) {
  try {
    const value = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function importExternalSkills(
  candidates: ExternalSkillCandidate[],
  destinationRoot: string,
  options: { overwrite?: boolean } = {},
): ImportResult[] {
  fs.mkdirSync(destinationRoot, { recursive: true });
  const manifestPath = path.join(path.dirname(destinationRoot), 'imported-skills.json');
  const manifest = readManifest(manifestPath);
  const results: ImportResult[] = [];

  for (const candidate of candidates) {
    const destination = path.join(destinationRoot, candidate.name || 'invalid-skill');
    if (!candidate.compatible) {
      results.push({ candidate, destination, status: 'skipped', reason: candidate.errors.join(' ') });
      continue;
    }
    const existed = fs.existsSync(destination);
    if (existed && !options.overwrite) {
      results.push({ candidate, destination, status: 'skipped', reason: 'Destination already exists.' });
      continue;
    }

    const operationId = crypto.randomUUID();
    const temporary = path.join(destinationRoot, `.import-${candidate.name}-${operationId}`);
    const backup = path.join(destinationRoot, `.backup-${candidate.name}-${operationId}`);
    try {
      fs.cpSync(candidate.skillRoot, temporary, {
        recursive: true,
        errorOnExist: true,
        filter: (source) => {
          if (fs.lstatSync(source).isSymbolicLink()) throw new Error(`Skill changed during import; refusing symbolic link: ${source}`);
          return !EXCLUDED_DIRECTORY_NAMES.has(path.basename(source));
        },
      });
      if (existed) fs.renameSync(destination, backup);
      try {
        fs.renameSync(temporary, destination);
      } catch (error) {
        if (fs.existsSync(backup)) fs.renameSync(backup, destination);
        throw error;
      }
      fs.rmSync(backup, { recursive: true, force: true });
      results.push({ candidate, destination, status: existed ? 'replaced' : 'imported' });
      manifest.push({
        name: candidate.name,
        source: candidate.source,
        sourcePath: candidate.skillRoot,
        destination,
        importedAt: new Date().toISOString(),
      });
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true });
      if (fs.existsSync(backup) && !fs.existsSync(destination)) fs.renameSync(backup, destination);
      else fs.rmSync(backup, { recursive: true, force: true });
    }
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return results;
}
