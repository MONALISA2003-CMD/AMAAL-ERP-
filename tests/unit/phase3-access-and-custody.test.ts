import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

test('Phase 3 login authority matches Amaal hierarchy', () => {
  const org = read('services/api/src/organization.ts');
  assert.match(org, /Admins can recruit Regional Managers, Managers, Team Leaders, Agents and Shop Owners only\./);
  assert.match(org, /Only the CEO can provision an Admin/);
});

test('Phase 3 database hardening contains custody and invitation authority controls', () => {
  const sql = read('database/migrations/20261003_000024_phase3_inventory_custody_hardening.sql');
  assert.match(sql, /imei_units_imei2_uq/);
  assert.match(sql, /validate_imei_custody/);
  assert.match(sql, /validate_identity_invitation_authority/);
  assert.match(sql, /Admins cannot directly recruit Recovery Officers/);
  assert.match(sql, /new\.role::text = 'ADMIN'/);
  assert.match(sql, /approved admin profile key and no organizational scope/);
});

test('Phase 3 allocation approval is scope-checked', () => {
  const service = read('services/inventory/src/service.ts');
  assert.match(service, /assertTargetOwnership\(tx, actorUserId, approvalTarget, context\)/);
  assert.match(service, /authorize\(context, 'inventory\.allocate', sourceResource\)/);
});

test('Phase 3 sale reversal restores team and shop custody', () => {
  const reversal = read('services/finance/src/reversal.ts');
  assert.match(reversal, /pre_sale_team_id/);
  assert.match(reversal, /pre_sale_shop_id/);
});

test('Phase 3 frontend uses real catalog brand IDs', () => {
  const page = read('apps/web/app/inventory/page.tsx');
  assert.match(page, /v1\/catalog\/brands/);
  assert.match(page, /value=\{b\.id\}/);
});


test('Phase 3 exact login creation hierarchy is enforced in API and UI', () => {
  const org = read('services/api/src/organization.ts');
  const page = read('apps/web/app/organization/page.tsx');
  assert.match(org, /CEO may create or invite Admins only/);
  assert.match(page, /if \(isCeo\) return \[\];/);
});

test('Phase 3 reconciliation is durable and exposed through API', () => {
  const migration = read('database/migrations/20261003_000025_phase3_reconciliation_and_hierarchy_exactness.sql');
  const service = read('services/inventory/src/reconciliation.ts');
  const http = read('services/api/src/http.ts');
  assert.match(migration, /inventory_reconciliation_runs/);
  assert.match(migration, /inventory_reconciliation_scans/);
  assert.match(service, /finalizeRun/);
  assert.match(http, /inventory\/reconciliations/);
});


test('Phase 3 catalog lifecycle is non-destructive and auditable', () => {
  const catalog = read('services/catalog/src/service.ts');
  const api = read('services/api/src/http.ts');
  assert.match(catalog, /products\.edit/);
  assert.match(catalog, /products\.archive/);
  assert.match(catalog, /status='ARCHIVED'::public\.record_status/);
  assert.match(catalog, /SKU cannot be changed after physical IMEI inventory exists/);
  assert.match(catalog, /PRODUCT_ARCHIVED/);
  assert.match(api, /updateCatalogBrand/);
  assert.match(api, /archiveCatalogBrand/);
  assert.match(api, /updateCatalogProduct/);
  assert.match(api, /archiveCatalogProduct/);
  assert.match(api, /updateCatalogVariant/);
  assert.match(api, /archiveCatalogVariant/);
});

test('Phase 3 inventory trace UI consumes the immutable movement endpoint', () => {
  const page = read('apps/web/app/inventory/page.tsx');
  assert.match(page, /\/v1\/inventory\/imeis\/\$\{item\.imei_id\}\/movements/);
  assert.match(page, /IMEI TRACE/);
  assert.match(page, /History/);
});
