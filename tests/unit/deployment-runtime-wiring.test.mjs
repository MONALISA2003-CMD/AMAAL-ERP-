import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const workerPkg = JSON.parse(readFileSync(join(root, 'services/outbox-worker/package.json'), 'utf8'));
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const render = readFileSync(join(root, 'render.yaml'), 'utf8');
const http = readFileSync(join(root, 'services/api/src/http.ts'), 'utf8');
const api = readFileSync(join(root, 'apps/web/lib/api.ts'), 'utf8');
const proxy = readFileSync(join(root, 'apps/web/app/api/amaal/[...path]/route.ts'), 'utf8');

test('repository pins one pnpm version across deployment configuration', () => {
  assert.equal(rootPkg.packageManager, 'pnpm@11.28.0');
  assert.match(vercel.installCommand, /pnpm@11\.28\.0/);
  assert.match(render, /pnpm@11\.28\.0/);
});

test('outbox worker declares every runtime workspace package it imports', () => {
  assert.equal(workerPkg.dependencies['@amaal/database'], 'workspace:*');
  assert.equal(workerPkg.dependencies['@amaal/recovery'], 'workspace:*');
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
});

test('known runtime wiring regressions remain fixed in reporting and inventory', () => {
  const reporting = readFileSync(join(root, 'services/api/src/reporting.ts'), 'utf8');
  const inventory = readFileSync(join(root, 'services/inventory/src/service.ts'), 'utf8');
  assert.doesNotMatch(reporting, /comparisonSalesExtra/);
  assert.match(reporting, /appendAnd\(salesExtra\)/);
  assert.doesNotMatch(inventory, /approvalScope\.region_id|dispatchScope\.region_id|approvalScope\.team_id|dispatchScope\.team_id/);
});

test('required deployment files exist', () => {
  for (const path of ['package.json','pnpm-workspace.yaml','vercel.json','render.yaml','.github/workflows/ci.yml','services/api/src/http.ts','services/outbox-worker/src/runner.ts','services/outbox-worker/package.json']) {
    assert.equal(existsSync(join(root,path)), true, path);
  }
});
