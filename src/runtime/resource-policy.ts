import path from 'node:path';
import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';

export type FurbyResourcePurpose = 'interactive' | 'scheduled' | 'a2a';

export const FURBY_EXCLUDED_GLOBAL_EXTENSIONS = Object.freeze([
  'scheduler',
  'a2a-protocol',
]);

export const FURBY_RESOURCE_POLICY = Object.freeze({
  loadGlobalExtensions: false,
  defaultLoadGlobalSkills: false,
  reason: 'Furby Open is headless, owns scheduler/A2A lifecycles, and isolates public starter skills by default.',
});

function pathIsWithin(root: string, candidate: string) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function createFurbyResourceLoader(options: {
  cwd: string;
  agentDir: string;
  purpose: FurbyResourcePurpose;
  systemPrompt?: string;
  loadGlobalSkills?: boolean;
}) {
  return new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: options.agentDir,
    noExtensions: true,
    noSkills: false,
    noThemes: true,
    noPromptTemplates: false,
    systemPromptOverride: options.systemPrompt ? () => options.systemPrompt : undefined,
    skillsOverride: options.loadGlobalSkills
      ? undefined
      : (current) => ({
        skills: current.skills.filter((skill) => pathIsWithin(options.cwd, skill.filePath)),
        diagnostics: current.diagnostics,
      }),
    promptsOverride: (current) => ({
      prompts: current.prompts.filter((prompt) => pathIsWithin(options.cwd, prompt.filePath)),
      diagnostics: current.diagnostics,
    }),
    agentsFilesOverride: (current) => ({
      agentsFiles: current.agentsFiles.filter((file) => pathIsWithin(options.cwd, file.path)),
    }),
  });
}

export function loadedExtensionPaths(loader: DefaultResourceLoader) {
  return loader.getExtensions().extensions.map((extension) => extension.path);
}
