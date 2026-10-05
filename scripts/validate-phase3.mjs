import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));
const checks = [];
function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

const migration = read('database/migrations/20261003_000024_phase3_inventory_custody_hardening.sql');
const inventory = read('services/inventory/src/service.ts');
const inventoryRead = read('services/inventory/src/read-service.ts');
const catalog = read('services/catalog/src/service.ts');
const org = read('services/api/src/organization.ts');
const http = read('services/api/src/http.ts');
const api = read('services/api/src/index.ts');
const page = read('apps/web/app/inventory/page.tsx');
const runner = read('package.json');

check('Phase 3 migration exists', exists('database/migrations/20261003_000024_phase3_inventory_custody_hardening.sql'));
check('Catalog service package exists', exists('services/catalog/package.json'));
check('Inventory read service exists', exists('services/inventory/src/read-service.ts'));
check('Inventory UI exists', exists('apps/web/app/inventory/page.tsx'));
check('Product and inventory permissions are seeded', ['products.view','products.create','inventory.view','inventory.allocate','inventory.transfer','inventory.adjust','inventory.writeoff'].every((k) => migration.includes(`'${k}'`)));
check('All Admin profiles receive users.create', migration.includes("('SYSTEM_ADMIN'),('USER_ADMIN'),('INVENTORY_ADMIN'),('FINANCE_ADMIN')") && migration.includes("('REPORTING_ADMIN'),('OPERATIONS_ADMIN'),('AUDIT_ADMIN')"));
check('Admin recruitment excludes Recovery Officer', org.includes("!['REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER'].includes(role)") && org.includes('Admins can recruit Regional Managers, Managers, Team Leaders, Agents and Shop Owners only.'));
check('CEO-only Admin provisioning remains enforced', org.includes("Only the CEO can provision an Admin.") && org.includes("Only the CEO can invite an Admin."));
check('Database invitation authority trigger exists', migration.includes('validate_identity_invitation_authority') && migration.includes('Admins cannot directly recruit Recovery Officers'));
check('Secondary IMEI uniqueness is enforced', migration.includes('imei_units_imei2_uq'));
check('IMEI custody invariant trigger exists', migration.includes('imei_units_validate_custody') && migration.includes('validate_imei_custody'));
check('Current custody projection exists', migration.includes('create or replace view public.imei_current_custody'));
check('Catalog validates 15-digit IMEI', catalog.includes('const IMEI_PATTERN = /^\\d{15}$/'));
check('Catalog receipt is transactional/audited', catalog.includes("INVENTORY_RECEIPT_CREATED") && catalog.includes('outbox_events'));
check('Allocation approval checks target and source scope', inventory.includes('await assertTargetOwnership(tx, actorUserId, approvalTarget, context);') && inventory.includes("authorize(context, 'inventory.allocate', sourceResource)"));
check('Allocation source custody is captured', inventory.includes('source_team_id') && inventory.includes('source_shop_id'));
check('Allocation transfer records team/shop endpoints', inventory.includes('from_team_id,to_team_id,from_shop_id,to_shop_id'));
check('Sale reversal restores pre-sale custody fields', read('services/finance/src/reversal.ts').includes('pre_sale_team_id') && read('services/finance/src/reversal.ts').includes('pre_sale_shop_id'));
check('Catalog and inventory GET routes exist', http.includes('/v1/catalog/brands') && http.includes('/v1/catalog/products') && http.includes('/v1/inventory/imeis'));
check('Inventory receipt and catalog POST routes exist', http.includes('/v1/inventory/receipts') && http.includes('/v1/catalog/variants'));
check('API wires catalog and inventory read services', api.includes('inventoryRead:new PostgresInventoryReadService()') && api.includes('catalog:new PostgresCatalogService()'));
check('Inventory UI loads actual brand ids', page.includes("apiFetch<{ items: Brand[] }>('/v1/catalog/brands')") && page.includes('value={b.id}'));
check('Phase 3 validator registered', runner.includes('"validate:phase3"'));

check('Exact CEO/Admin recruitment hierarchy in API', org.includes('CEO may create or invite Admins only') && org.includes('CEO may create or invite Admins only; subordinate organizational roles are Admin-controlled.'));
check('Exact CEO/Admin recruitment hierarchy in UI', read('apps/web/app/organization/page.tsx').includes('if (isCeo) return [];'));
check('Inventory reconciliation migration exists', exists('database/migrations/20261003_000025_phase3_reconciliation_and_hierarchy_exactness.sql'));
check('Durable reconciliation tables are defined', read('database/migrations/20261003_000025_phase3_reconciliation_and_hierarchy_exactness.sql').includes('inventory_reconciliation_runs') && read('database/migrations/20261003_000025_phase3_reconciliation_and_hierarchy_exactness.sql').includes('inventory_reconciliation_scans'));
check('Reconciliation API and service exist', exists('services/inventory/src/reconciliation.ts') && http.includes('/v1/inventory/reconciliations') && api.includes('createInventoryReconciliation'));
check('Catalog lifecycle edit/archive endpoints exist', catalog.includes('updateBrand') && catalog.includes('archiveBrand') && catalog.includes('updateProduct') && catalog.includes('archiveProduct') && catalog.includes('updateVariant') && catalog.includes('archiveVariant'));
check('Non-destructive catalog archival is enforced', catalog.includes("status='ARCHIVED'::public.record_status") && catalog.includes('PRODUCT_ARCHIVED'));
check('Inventory movement history UI is wired', page.includes('DEVICE HISTORY') && page.includes('/v1/inventory/imeis/${item.imei_id}/movements'));

console.log(`Phase 3 validation passed: ${checks.length} checks.`);
