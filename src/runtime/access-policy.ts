import fs from 'node:fs/promises';
import path from 'node:path';

export type AccessScope = 'project' | 'outside';
export type FurbyPromptPurpose = 'interactive' | 'scheduled' | 'a2a';
export type ProjectFileOperation = 'read' | 'write';

const OUTSIDE_BUILT_IN_TOOLS = ['read', 'bash', 'edit', 'write'] as const;
const A2A_TOOL_NAMES = new Set(['write_a2a_response', 'list_a2a_pending']);

export function effectiveAccessToolNames(
  scope: AccessScope,
  purpose: FurbyPromptPurpose,
  registeredCustomToolNames: readonly string[],
) {
  if (purpose === 'a2a') {
    return {
      builtIn: [] as string[],
      custom: registeredCustomToolNames.filter((name) => A2A_TOOL_NAMES.has(name)),
    };
  }
  return {
    builtIn: scope === 'outside' ? [...OUTSIDE_BUILT_IN_TOOLS] : [],
    custom: [...registeredCustomToolNames],
  };
}

export function accessScopeSummary(scope: AccessScope) {
  return scope === 'project'
    ? 'read, edit, and write access confined to the Furby Open project; no host shell'
    : 'unrestricted host filesystem read, edit, and write access plus host shell commands';
}

function isWithinRoot(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function outsideProjectError(requestedPath: string) {
  return new Error(`Access denied: ${requestedPath} is outside the Furby Open project.`);
}

const PROTECTED_CREDENTIAL_NAMES = new Set([
  'auth.json',
  'credential.json',
  'credentials.json',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  'id_rsa',
  'service-account.json',
  'service_account.json',
]);
const PROTECTED_CREDENTIAL_EXTENSIONS = new Set(['.cer', '.crt', '.der', '.key', '.p12', '.pem', '.pfx']);

function normalizedRelativePath(root: string, candidate: string) {
  return path.relative(root, candidate).split(path.sep).join('/').toLowerCase();
}

function isProtectedProjectPath(relativePath: string) {
  const baseName = path.posix.basename(relativePath);
  const extension = path.posix.extname(baseName);
  return relativePath === '.data/furby-open.db'
    || relativePath.startsWith('.data/furby-open.db-')
    || relativePath === '.data/backups'
    || relativePath.startsWith('.data/backups/')
    || /\.(?:bak|backup)$/u.test(baseName)
    || /(?:^|\/)[^/]*backup[^/]*\.(?:tar|tar\.gz|tgz|zip)$/u.test(relativePath)
    || PROTECTED_CREDENTIAL_NAMES.has(baseName)
    || PROTECTED_CREDENTIAL_EXTENSIONS.has(extension);
}

function applyProjectInternalPolicy(
  projectRoot: string,
  candidate: string,
  operation: ProjectFileOperation,
  requestedPath: string,
) {
  const relativePath = normalizedRelativePath(projectRoot, candidate);
  if (isProtectedProjectPath(relativePath)) {
    throw new Error(`Access denied: ${requestedPath} is a protected project path.`);
  }
  if (operation === 'write' && (relativePath === '.git' || relativePath.startsWith('.git/'))) {
    throw new Error(`Access denied: ${requestedPath} is a read-only project path.`);
  }
}

function isMissingPathError(error: unknown) {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

async function resolveThroughNearestExistingAncestor(candidate: string) {
  let current = candidate;
  const missingSegments: string[] = [];
  while (true) {
    try {
      const canonicalAncestor = await fs.realpath(current);
      return path.join(canonicalAncestor, ...missingSegments);
    } catch (error) {
      if (!isMissingPathError(error)) throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      missingSegments.unshift(path.basename(current));
      current = parent;
    }
  }
}

export class ProjectAccessPolicy {
  private constructor(readonly projectRoot: string) {}

  static async create(projectRoot: string) {
    const canonicalRoot = await fs.realpath(path.resolve(projectRoot));
    return new ProjectAccessPolicy(canonicalRoot);
  }

  async resolvePath(requestedPath: string, _operation: ProjectFileOperation) {
    const lexicalPath = path.isAbsolute(requestedPath)
      ? path.resolve(requestedPath)
      : path.resolve(this.projectRoot, requestedPath);
    if (!isWithinRoot(this.projectRoot, lexicalPath)) throw outsideProjectError(requestedPath);

    const canonicalPath = await resolveThroughNearestExistingAncestor(lexicalPath);
    if (!isWithinRoot(this.projectRoot, canonicalPath)) throw outsideProjectError(requestedPath);
    applyProjectInternalPolicy(this.projectRoot, lexicalPath, _operation, requestedPath);
    if (canonicalPath !== lexicalPath) {
      applyProjectInternalPolicy(this.projectRoot, canonicalPath, _operation, requestedPath);
    }
    return canonicalPath;
  }
}

export function createProjectAccessPolicy(projectRoot: string) {
  return ProjectAccessPolicy.create(projectRoot);
}
