import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const webRoot = path.join(repoRoot, 'apps', 'web');
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(full);
  }
}

walk(webRoot);
const failures = [];

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const names = new Map();
  for (const match of source.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) {
    const name = match[1];
    const line = source.slice(0, match.index).split('\n').length;
    const previous = names.get(name);
    if (previous) failures.push(`${path.relative(repoRoot, file)}: duplicate function ${name} at lines ${previous} and ${line}`);
    else names.set(name, line);
  }

  const constNames = new Map();
  for (const match of source.matchAll(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^\n]*\)|[A-Za-z_$][\w$]*)\s*=>/gm)) {
    const name = match[1];
    const line = source.slice(0, match.index).split('\n').length;
    const previous = constNames.get(name);
    if (previous) failures.push(`${path.relative(repoRoot, file)}: duplicate arrow function ${name} at lines ${previous} and ${line}`);
    else constNames.set(name, line);
  }
}

if (failures.length) {
  console.error('Web declaration check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Web declaration check passed across ${files.length} source files.`);
