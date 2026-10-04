import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const errors = [];
function has(path, needle) {
  let source = '';
  try { source = readFileSync(join(root, path), 'utf8'); } catch { errors.push(`missing ${path}`); return; }
  if (!source.includes(needle)) errors.push(`${path}: missing ${needle}`);
}
function file(path) {
  try { if (!statSync(join(root, path)).isFile()) errors.push(`missing ${path}`); } catch { errors.push(`missing ${path}`); }
}

[
  'services/api/src/workspace.ts',
  'services/api/src/realtime.ts',
  'apps/web/lib/realtime.ts',
  'docs/AMAAL_PHASE6_IMPLEMENTATION.md',
  'tests/unit/phase6-workspace.test.ts',
  'tests/unit/phase6-realtime.test.ts',
  'tests/unit/phase6-scope-contract.test.ts',
].forEach(file);

has('services/api/src/http.ts', "pathname === '/v1/workspace/summary'");
has('services/api/src/http.ts', "pathname === '/v1/realtime/events'");
has('services/api/src/http.ts', 'installRealtimeServer');
has('services/api/src/workspace.ts', 'CEO Command Center');
has('services/api/src/workspace.ts', 'Team Leader Workspace');
has('services/api/src/workspace.ts', 'Regional Command Center');
has('services/api/src/workspace.ts', 'inventory_authoritative');
has('services/api/src/workspace.ts', 'customers.view');
has('services/api/src/workspace.ts', 'coalesce(s.completed_at,s.created_at)');
has('services/api/src/realtime.ts', "'amaal.v1'");
has('services/api/src/realtime.ts', 'realtime_events');
has('services/api/src/realtime.ts', 'adminRealtimePermission');
has('services/outbox-worker/src/projector.ts', 'amaal:realtime');
has('services/outbox-worker/src/projector.ts', 'sale_items');
has('apps/web/lib/realtime.ts', '2 ** retry');
has('apps/web/lib/realtime.ts', '/api/amaal/v1/realtime/events');
has('apps/web/app/dashboard/page.tsx', 'href="/customers"');
has('apps/web/app/dashboard/page.tsx', 'href="/sales"');
has('apps/web/app/dashboard/page.tsx', 'href="/finance"');

const apiManifest = JSON.parse(readFileSync(join(root, 'services/api/package.json'), 'utf8'));
const workerManifest = JSON.parse(readFileSync(join(root, 'services/outbox-worker/package.json'), 'utf8'));
if (!apiManifest.dependencies?.ioredis) errors.push('services/api/package.json: missing ioredis');
if (!apiManifest.dependencies?.ws) errors.push('services/api/package.json: missing ws');
if (!apiManifest.devDependencies?.['@types/ws']) errors.push('services/api/package.json: missing @types/ws');
if (!workerManifest.dependencies?.ioredis) errors.push('services/outbox-worker/package.json: missing ioredis');

const filesToScan = [
  'services/api/src/workspace.ts',
  'services/api/src/realtime.ts',
  'services/outbox-worker/src/projector.ts',
];
for (const path of filesToScan) {
  const source = readFileSync(join(root, path), 'utf8');
  if (/sale_datetime/.test(source)) errors.push(`${path}: references sale_datetime, which is absent from the verified production sales schema`);
  if (/owner_user_id/.test(source)) errors.push(`${path}: references owner_user_id, which is absent from the verified production customers schema`);
}

if (errors.length) {
  console.error('Stage 6 validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('Stage 6 validation passed: realtime transport, role workspace, dependency, route, and production-schema guardrails are present.');
