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
  'docs/AMAAL_JARVIS_TOOL_CONTRACT.md',
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
if (packageManifest.packageManager !== 'pnpm@12.7.0') {
  console.error(`Invalid packageManager: expected pnpm@12.7.0, found ${packageManifest.packageManager ?? 'missing'}`);
  process.exit(1);
}
if (packageManifest.devEngines?.packageManager) {
  console.error('devEngines.packageManager must not be declared because Render invokes pnpm through npm/npx.');
  process.exit(1);
}

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
