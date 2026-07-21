import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { config } from '../config/env.js';
import {
  detectExternalAgents,
  discoverExternalSkills,
  externalSkillSources,
  importExternalSkills,
  type ExternalAgentSource,
} from '../skills/external-skill-importer.js';

const args = new Set(process.argv.slice(2));
const values = process.argv.slice(2);
const has = (flag: string) => args.has(flag);
const valueFor = (prefix: string) => values.find((value) => value.startsWith(`${prefix}=`))?.slice(prefix.length + 1);
const valueList = (prefix: string) => values.filter((value) => value.startsWith(`${prefix}=`)).map((value) => value.slice(prefix.length + 1));

if (has('--help') || has('-h')) {
  console.log(`Furby Open external skill importer

Usage:
  npm run skills:import -- --list
  npm run skills:import
  npm run skills:import -- --all --yes
  npm run skills:import -- --skill=context7-mcp --yes

Options:
  --list                  Detect agents and list candidates without importing
  --all                   Select every compatible discovered skill
  --skill=<name-or-id>    Select one skill; may be repeated
  --source=<source>       Filter: codex, claude-code, or agent-skills
  --overwrite             Replace an existing destination skill
  --yes                   Confirm non-interactively
  --help                  Show this help
`);
  process.exit(0);
}

const allowedSources = new Set<ExternalAgentSource>(['codex', 'claude-code', 'agent-skills']);
const requestedSource = valueFor('--source') as ExternalAgentSource | undefined;
if (requestedSource && !allowedSources.has(requestedSource)) {
  throw new Error(`Unknown source ${requestedSource}. Use codex, claude-code, or agent-skills.`);
}

console.log('External coding agents');
for (const agent of detectExternalAgents()) {
  console.log(`- ${agent.installed ? 'FOUND' : 'MISS '} ${agent.name}${agent.executablePath ? `: ${agent.executablePath}` : ''}`);
}

console.log('\nSkill directories');
for (const source of externalSkillSources()) {
  console.log(`- ${source.exists ? 'FOUND' : 'MISS '} ${source.label}: ${source.root}`);
}

let candidates = discoverExternalSkills();
if (requestedSource) candidates = candidates.filter((candidate) => candidate.source === requestedSource);

console.log(`\nDiscovered ${candidates.length} skill candidate(s):`);
for (const candidate of candidates) {
  const status = candidate.compatible ? 'READY' : 'SKIP ';
  console.log(`- ${status} ${candidate.id}${candidate.name ? ` -> ${candidate.name}` : ''} (${candidate.fileCount} files, ${candidate.sizeBytes} bytes)`);
  for (const warning of candidate.warnings) console.log(`        WARN ${warning}`);
  for (const error of candidate.errors) console.log(`        ERROR ${error}`);
}

if (has('--list')) process.exit(0);

const requestedSkills = valueList('--skill');
let selected = candidates.filter((candidate) => candidate.compatible);
if (!has('--all') && requestedSkills.length > 0) {
  selected = selected.filter((candidate) => requestedSkills.includes(candidate.name) || requestedSkills.includes(candidate.id));
  const found = new Set(selected.flatMap((candidate) => [candidate.name, candidate.id]));
  const missing = requestedSkills.filter((requested) => !found.has(requested));
  if (missing.length > 0) throw new Error(`Compatible skill(s) not found: ${missing.join(', ')}`);
}

if (selected.length === 0) {
  console.log('\nNo compatible skills selected. Nothing was imported.');
  process.exit(0);
}

const destinationRoot = path.join(config.rootDir, '.pi', 'skills');
console.log(`\nSelected ${selected.length} skill(s) for ${destinationRoot}.`);
console.log('Imported skills may contain scripts or powerful instructions. Review their source before using them.');

let confirmed = has('--yes');
if (!confirmed) {
  if (!process.stdin.isTTY) throw new Error('Interactive confirmation requires a TTY. Re-run with --yes after reviewing --list output.');
  const prompt = readline.createInterface({ input, output });
  try {
    const answer = await prompt.question('Import the selected skills? Type IMPORT to continue: ');
    confirmed = answer === 'IMPORT';
  } finally {
    prompt.close();
  }
}

if (!confirmed) {
  console.log('Import cancelled.');
  process.exit(0);
}

const results = importExternalSkills(selected, destinationRoot, { overwrite: has('--overwrite') });
for (const result of results) {
  console.log(`- ${result.status.toUpperCase()} ${result.candidate.name} -> ${result.destination}${result.reason ? ` (${result.reason})` : ''}`);
}
const changed = results.filter((result) => result.status === 'imported' || result.status === 'replaced').length;
console.log(`\nImported or replaced ${changed} skill(s). Restart Furby Open or reset its Pi session before using newly imported skills.`);
