import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  detectExternalAgents,
  discoverExternalSkills,
  importExternalSkills,
} from '../src/skills/external-skill-importer.js';

function writeSkill(root: string, relative: string, frontmatter: string, body = '# Instructions\n') {
  const directory = path.join(root, relative);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'SKILL.md'), `---\n${frontmatter}\n---\n\n${body}`);
  return directory;
}

test('detects installed agent executables from PATH', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'furby-agent-bin-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const codex = path.join(root, 'codex');
  fs.writeFileSync(codex, '#!/bin/sh\n');
  fs.chmodSync(codex, 0o755);
  const detected = detectExternalAgents({ PATH: root });
  assert.equal(detected.find((agent) => agent.command === 'codex')?.installed, true);
  assert.equal(detected.find((agent) => agent.command === 'claude')?.installed, false);
});

test('discovers compatible skills and excludes hidden system skills', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'furby-skill-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  writeSkill(path.join(home, '.codex', 'skills'), 'reviewer', 'name: reviewer\ndescription: Reviews a change.');
  writeSkill(path.join(home, '.codex', 'skills'), '.system/internal', 'name: internal\ndescription: Hidden built-in.');
  writeSkill(path.join(home, '.claude', 'skills'), 'missing-description', 'name: missing-description');
  writeSkill(
    path.join(home, '.agents', 'skills'),
    'claude-paths',
    'name: claude-paths\ndescription: Uses Claude paths.\nallowed-tools: Bash',
    'Run ${CLAUDE_SKILL_DIR}/script.sh\n',
  );

  const candidates = discoverExternalSkills(home);
  assert.deepEqual(candidates.map((candidate) => candidate.name), ['claude-paths', 'missing-description', 'reviewer']);
  assert.equal(candidates.some((candidate) => candidate.name === 'internal'), false);
  assert.equal(candidates.find((candidate) => candidate.name === 'reviewer')?.compatible, true);
  assert.equal(candidates.find((candidate) => candidate.name === 'missing-description')?.compatible, false);
  assert.ok((candidates.find((candidate) => candidate.name === 'claude-paths')?.warnings.length ?? 0) >= 1);
});

test('imports compatible skills, writes provenance, and skips collisions', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'furby-skill-import-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'furby-skill-project-'));
  t.after(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(project, { recursive: true, force: true });
  });

  const source = writeSkill(
    path.join(home, '.claude', 'skills'),
    'note-helper',
    'name: note-helper\ndescription: Helps with notes.',
  );
  fs.writeFileSync(path.join(source, 'REFERENCE.md'), '# Reference\n');
  const candidate = discoverExternalSkills(home).find((item) => item.name === 'note-helper');
  assert.ok(candidate);

  const destinationRoot = path.join(project, '.pi', 'skills');
  const first = importExternalSkills([candidate], destinationRoot);
  assert.equal(first[0].status, 'imported');
  assert.equal(fs.existsSync(path.join(destinationRoot, 'note-helper', 'SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(destinationRoot, 'note-helper', 'REFERENCE.md')), true);
  assert.equal(fs.existsSync(path.join(project, '.pi', 'imported-skills.json')), true);

  const second = importExternalSkills([candidate], destinationRoot);
  assert.equal(second[0].status, 'skipped');
});

test('rejects a skill tree containing symbolic links', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'furby-skill-symlink-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const skill = writeSkill(path.join(home, '.claude', 'skills'), 'linked', 'name: linked\ndescription: Has a link.');
  fs.symlinkSync('/tmp', path.join(skill, 'outside'));
  const candidate = discoverExternalSkills(home).find((item) => item.name === 'linked');
  assert.equal(candidate?.compatible, false);
  assert.match(candidate?.errors.join(' ') ?? '', /Symbolic links are not imported/u);
});
