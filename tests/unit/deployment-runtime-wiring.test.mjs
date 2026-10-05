import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const workerPkg = JSON.parse(readFileSync(join(root, 'services/outbox-worker/package.json'), 'utf8'));
const vercel = JSON.parse(readFileSync(join(root, 'apps/web/vercel.json'), 'utf8'));
const render = readFileSync(join(root, 'render.yaml'), 'utf8');
const http = readFileSync(join(root, 'services/api/src/http.ts'), 'utf8');
const api = readFileSync(join(root, 'apps/web/lib/api.ts'), 'utf8');
const proxy = readFileSync(join(root, 'apps/web/app/api/amaal/[...path]/route.ts'), 'utf8');
const recoveryEngine = readFileSync(join(root, 'services/recovery/src/aging-engine.ts'), 'utf8');
const aiTypeContract = readFileSync(join(root, 'apps/web/lib/api.ts'), 'utf8');
const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');

test('deployment installers are npm-only and Vercel builds the standalone web package', () => {
  assert.equal(rootPkg.packageManager, undefined);
  assert.deepEqual(rootPkg.workspaces, ['apps/*','packages/*','services/*','workers/*']);
  assert.match(vercel.installCommand, /npm install/);
  assert.match(vercel.buildCommand, /npm run build/);
  assert.equal(vercel.outputDirectory, '.next');
  assert.doesNotMatch(vercel.installCommand + vercel.buildCommand + render, /pnpm@|pnpm install/);
});

test('outbox worker declares every runtime workspace package it imports', () => {
  assert.equal(workerPkg.dependencies['@amaal/database'], 'file:../../packages/database');
  assert.equal(workerPkg.dependencies['@amaal/recovery'], 'file:../recovery');
});

test('Render API entrypoint always autostarts when PORT is provided', () => {
  assert.match(http, /shouldAutostart/);
  assert.match(http, /Boolean\(process\.env\.PORT\)/);
  assert.match(http, /server\.listen\(port,'0\.0\.0\.0'/);
});

test('health and readiness endpoints remain present', () => {
  assert.match(http, /publicHealthPaths = new Set\(\['\/health','\/ready'\]\)/);
  assert.match(http, /checkDatabaseReadiness\(services\)/);
});

test('browser API calls cross the same Amaal proxy boundary and backend has the route normalizer', () => {
  assert.match(api, /return '\/api\/amaal'/);
  assert.match(proxy, /AMAAL_BACKEND_URL/);
  assert.match(proxy, /amaal-api\.onrender\.com/);
  assert.match(http, /rawPath\.startsWith\('\/api\/'\)/);
});

test('Render blueprint carries the server-side Neon Auth bridge and worker runtime settings', () => {
  for (const key of ['AMAAL_NEON_AUTH_URL','AMAAL_NEON_AUTH_JWKS_URL','AMAAL_NEON_AUTH_ISSUER','AMAAL_NEON_AUTH_AUDIENCE','AMAAL_DATABASE_URL','AMAAL_VALKEY_URL']) {
    assert.match(render, new RegExp(`key: ${key}`));
  }
  assert.match(render, /AMAAL_API_AUTOSTART/);
  assert.match(render, /name: amaal-worker/);
  assert.match(render, /healthCheckPath: \/health/);
  assert.match(render, /services\/outbox-worker\/src\/runner\.ts/);
});

test('recovery worker is schema-safe before Stage 5 migrations are applied', () => {
  assert.match(recoveryEngine, /checkStage5Schema/);
  assert.match(recoveryEngine, /to_regclass\('public\.aging_asset_states'\)/);
  assert.match(recoveryEngine, /band_config/);
  assert.match(recoveryEngine, /scheduled evaluation is safely skipped/);
});

test('AI action-plan UI contract includes the expiration field returned by the server', () => {
  assert.match(aiTypeContract, /export type AmaalAIActionPlan = [\s\S]*expiresAt: string \| null/);
});

test('internal workspace dependencies are local file links, not registry versions', () => {
  const paths = [
    ['services/api/package.json', ['@amaal/approvals','@amaal/ai','@amaal/database']],
    ['apps/amaal-ai/package.json', ['@amaal/approvals','@amaal/database']],
    ['packages/permissions/package.json', ['@amaal/database']],
  ];
  for (const [path, names] of paths) {
    const pkg = JSON.parse(readFileSync(join(root, path), 'utf8'));
    for (const name of names) assert.match(pkg.dependencies[name], /^file:/, `${path} -> ${name}`);
  }
});

test('CI is validation-only and does not rewrite the production branch', () => {
  assert.match(ci, /Amaal CI and release gates/);
  assert.doesNotMatch(ci, /git push origin|git commit/);
});

test('known runtime wiring regressions remain fixed in reporting and inventory', () => {
  const reporting = readFileSync(join(root, 'services/api/src/reporting.ts'), 'utf8');
  const inventory = readFileSync(join(root, 'services/inventory/src/service.ts'), 'utf8');
  assert.doesNotMatch(reporting, /comparisonSalesExtra/);
  assert.match(reporting, /appendAnd\(salesExtra\)/);
  assert.doesNotMatch(inventory, /approvalScope\.region_id|dispatchScope\.region_id|approvalScope\.team_id|dispatchScope\.team_id/);
});

test('required deployment files exist', () => {
  for (const path of ['package.json','pnpm-workspace.yaml','apps/web/vercel.json','render.yaml','.github/workflows/ci.yml','services/api/src/http.ts','services/outbox-worker/src/runner.ts','services/outbox-worker/package.json']) {
    assert.equal(existsSync(join(root,path)), true, path);
  }
});
