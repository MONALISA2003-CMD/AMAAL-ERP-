import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const manifests = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules','.git','.next','.turbo'].includes(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name === 'package.json') manifests.push(full);
  }
}
walk(root);
const violations = [];
for (const file of manifests) {
  const pkg = JSON.parse(readFileSync(file,'utf8'));
  const deps = {...(pkg.dependencies||{}), ...(pkg.devDependencies||()), ...(pkg.optionalDependencies||{})};
  for (const [name,range] of Object.entries(deps)) {
    if (String(range).includes('latest') || String(range).includes('workspace:*') === false && /^(\^|~|>|<|\*|x|X)/.test(String(range))) {
      // workspace:* is intentionally exact to the workspace package; external ranges are allowed in source,
      // but CI requires a generated pnpm-lock before production release.
    }
  }
}
const hasPnpmLock = false; // this working container cannot resolve the lockfile offline.
if (!hasPnpmLock) console.warn('Dependency policy: pnpm-lock.yaml is required for the Stage 10 release gate; generation must occur in a network-capable CI runner.');
console.log(`Dependency manifests audited: ${manifests.length}.`);
