import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

const required = [
  'apps/web/package.json',
  'apps/web/vercel.json',
  'apps/web/next.config.ts',
  'apps/web/app/password-reset/page.tsx',
  '.github/workflows/ci.yml',
];

const forbidden = [
  'vercel.json',
  'scripts/vercel-ignore-build.sh',
  '.github/workflows/zip-sync.yml',
];

const missing = required.filter((file) => !existsSync(resolve(repoRoot, file)));
const presentForbidden = forbidden.filter((file) => existsSync(resolve(repoRoot, file)));

if (missing.length || presentForbidden.length) {
  if (missing.length) {
    console.error('Missing required deployment-architecture files:');
    for (const file of missing) console.error(`  - ${file}`);
  }
  if (presentForbidden.length) {
    console.error('Forbidden legacy deployment-architecture files detected:');
    for (const file of presentForbidden) console.error(`  - ${file}`);
  }
  process.exit(1);
}

console.log('Deployment architecture contract: PASS');
console.log('Vercel source of truth: apps/web');
console.log('GitHub main must remain source-only; no ZIP rewrite workflow is permitted.');
