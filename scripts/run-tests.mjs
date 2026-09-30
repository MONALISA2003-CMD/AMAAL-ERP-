import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
function collect(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collect(full));
    else if (entry.isFile() && entry.name.endsWith('.test.ts')) files.push(full);
  }
  return files;
}

const testFiles = collect(join(root, 'tests')).sort();
if (testFiles.length === 0) {
  console.error('No unit test files found.');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ['--experimental-transform-types', '--test', ...testFiles],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
