import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const required = [
  '.github/workflows/zip-sync.yml',
  'docs/source-specifications/AMAAL_MASTER_SYSTEM_SPECIFICATION-1.md',
  'docs/source-specifications/AMAAL_DATABASE_AND_AUTHORIZATION_BLUEPRINT-1.md',
  'docs/source-specifications/AMAAL_LLM_HANDOFF_MASTER.md',
  'docs/AMAAL_DOMAIN_MODEL.md',
  'docs/AMAAL_STATE_MACHINES.md',
  'docs/AMAAL_AUTHORIZATION_MATRIX.md',
  'docs/AMAAL_EVENT_CATALOG.md',
  'docs/AMAAL_API_CONTRACT.md',
  'docs/AMAAL_AI_TOOL_CONTRACT.md',
  'database/migrations/20260928_000001_core_foundation.sql',
  'database/policies/20260928_rls_foundation.sql',
  'database/verification/20260928_core_foundation_verify.sql',
  'packages/business-rules/src/index.ts',
  'packages/permissions/src/index.ts',
  'packages/database/src/index.ts',
  'package.json',
  'pnpm-workspace.yaml',
  'apps/web/package.json',
  'apps/web/app/layout.tsx',
  'services/api/package.json',
  'services/api/src/http.ts',
  'services/api/src/index.ts',
  'services/outbox-worker/package.json',
  'services/outbox-worker/src/runner.ts',
  'services/outbox-worker/src/index.ts',
  'database/migrations/20260930_000017_audit_request_id.sql'
];

const packageManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (packageManifest.packageManager !== 'pnpm@12.9.1') {
  console.error(`Invalid packageManager: expected pnpm@12.9.1, found ${packageManifest.packageManager ?? 'missing'}`);
  process.exit(1);
}
if (packageManifest.devEngines?.packageManager) {
  console.error('devEngines.packageManager must not be declared because Render invokes pnpm through npm/npx.');
  process.exit(1);
}


// Every runtime workspace import must be declared by the importing package. This
// catches Node ESM failures that TypeScript path resolution can otherwise hide
// until Render/Vercel starts a workspace entry point.
const workspaceManifests = new Map();
for (const manifestFile of [
  join(root, 'apps'), join(root, 'packages'), join(root, 'services'), join(root, 'workers'),
].filter((dir) => existsSync(dir))) {
  for (const entry of readdirSync(manifestFile, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = join(manifestFile, entry.name, 'package.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (manifest.name) workspaceManifests.set(manifest.name, { manifest, dir: join(manifestFile, entry.name) });
    } catch {}
  }
}
const runtimeDependencyFailures = [];
const workspaceImportRe = /(?:from\s*|import\s*\()(['"])(@amaal\/[^'"]+)\1/g;
for (const { manifest, dir } of workspaceManifests.values()) {
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
  const sourceRoot = join(dir, 'src');
  if (!existsSync(sourceRoot)) continue;
  const stack = [sourceRoot];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
        const source = readFileSync(full, 'utf8');
        for (const match of source.matchAll(workspaceImportRe)) {
          const dep = match[2];
          if (dep !== manifest.name && !declared.has(dep)) {
            runtimeDependencyFailures.push(`${relative(root, full)}: missing workspace dependency ${dep}`);
          }
        }
      }
    }
  }
}
if (runtimeDependencyFailures.length) failures.push(...runtimeDependencyFailures);

const missing = required.filter((p) => !existsSync(join(root, p)));
if (missing.length) {
  console.error('Missing required repository files:');
  for (const path of missing) console.error(`- ${path}`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (name === '.git' || name === '.sync-staging' || name === '.sync-backup') continue;
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(relative(root, full));
  }
  return out;
}

const docs = walk(root).filter((p) => /\.(md|markdown|doc|docx|mdx)$/i.test(p));
console.log(`Amaal repository validation passed. Documentation files present: ${docs.length}`);
