import { config } from '../config/env.js';
import { applyRetentionCandidates, collectRetentionCandidates } from '../operations/retention.js';

const apply = process.argv.includes('--apply');
const candidates = await collectRetentionCandidates(config.rootDir);
const totalBytes = candidates.reduce((sum, candidate) => sum + candidate.sizeBytes, 0);

console.log(`${apply ? 'Applying' : 'Dry run for'} Furby retention cleanup`);
console.log(`Candidates: ${candidates.length} file(s), ${totalBytes} byte(s)`);
for (const candidate of candidates) {
  console.log(`${candidate.category}\t${candidate.sizeBytes}\t${candidate.modifiedAt}\t${candidate.path}`);
}

if (apply) {
  const result = await applyRetentionCandidates(candidates);
  console.log(`Removed ${result.removedFiles} file(s), ${result.removedBytes} byte(s).`);
} else {
  console.log('No files removed. Re-run with --apply after reviewing the list.');
}
