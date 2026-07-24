import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('Unix and macOS launchers have valid shell syntax', () => {
  for (const file of ['install.sh', 'Install-Furby-Open.command']) {
    const result = spawnSync('bash', ['-n', path.join(root, file)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});

test('Unix installer pins a release and verifies private Node downloads', () => {
  const source = read('install.sh');
  assert.match(source, /INSTALL_VERSION="v\d+\.\d+\.\d+-alpha\.\d+"/u);
  assert.match(source, /git clone --branch "\$INSTALL_VERSION" --depth 1/u);
  assert.match(source, /nodejs\.org\/dist\/latest-v22\.x\/SHASUMS256\.txt/u);
  assert.match(source, /\[\[ "\$actual" == "\$expected" \]\]/u);
  assert.match(source, /npm ci/u);
  assert.match(source, /npm run setup/u);
  assert.doesNotMatch(source, /curl[^\n]*\|\s*(?:sudo\s+)?(?:ba)?sh/u);
});

test('Windows installer uses explicit package IDs and shared setup', () => {
  const source = read('install.ps1');
  assert.match(source, /OpenJS\.NodeJS\.22/u);
  assert.match(source, /Git\.Git/u);
  assert.match(source, /--branch \$InstallVersion --depth 1/u);
  assert.match(source, /npm\.cmd ci/u);
  assert.match(source, /npm\.cmd run setup/u);
  assert.doesNotMatch(source, /Set-ExecutionPolicy/u);
});

test('feature dependencies do not block text-only installation', () => {
  const shellCheck = read('scripts/check-system-deps.sh');
  const doctor = read('src/scripts/doctor.ts');
  assert.match(shellCheck, /check_optional ffmpeg/u);
  assert.match(shellCheck, /check_optional pdftotext/u);
  assert.match(doctor, /voice\/media conversion/u);
  assert.match(doctor, /PDF extraction/u);
});

test('shared setup fails closed without a TTY and preserves security rules', () => {
  const source = read('src/scripts/setup.ts');
  assert.match(source, /!stdin\.isTTY \|\| !stdout\.isTTY/u);
  assert.match(source, /npmCommand, \['run', 'setup:telegram'\]/u);
  assert.match(source, /without weakening safe mode, single-user authorization, workspace confinement/u);
  assert.match(source, /Nothing will be started automatically/u);
});
