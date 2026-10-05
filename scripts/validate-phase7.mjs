import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (rel) => {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) { failures.push(`missing: ${rel}`); return ''; }
  return fs.readFileSync(file, 'utf8');
};
const exists = (rel) => fs.existsSync(path.join(root, rel));
const has = (rel, needle) => { if (!read(rel).includes(needle)) failures.push(`${rel}: missing ${needle}`); };

for (const rel of [
  'services/api/src/reporting.ts',
  'services/api/src/reporting-math.ts',
  'services/api/src/reporting-export.ts',
  'services/outbox-worker/src/projector.ts',
  'apps/web/app/reports/page.tsx',
  'database/migrations/20261004_000030_phase7_reporting_read_models.sql',
  'tests/unit/phase7-reporting.test.mjs',
  'docs/AMAAL_PHASE7_IMPLEMENTATION.md',
  'docs/AMAAL_PROJECT_AUDIT_STAGE7_2026-10-04.md',
  'AMAAL_STAGE7_HANDOFF_2026-10-04.md',
  'STAGE7_CHANGE_MANIFEST.txt',
]) if (!exists(rel)) failures.push(`missing file: ${rel}`);

has('services/api/src/reporting.ts', "export type ReportPeriod = 'TODAY' | 'WEEK' | 'MONTH' | '3M' | '6M' | '12M'");
for (const period of ['TODAY', 'WEEK', 'MONTH', '3M', '6M', '12M']) has('services/api/src/reporting.ts', `case '${period}'`);
for (const comparison of ['AGENT', 'TEAM', 'MANAGER', 'REGION']) has('services/api/src/reporting.ts', `case '${comparison}'`);
for (const metric of ['sales', 'units', 'revenue', 'commission', 'aging', 'recovery', 'sellThroughProxyPct', 'stockConcentration']) has('services/api/src/reporting.ts', metric);
has('services/api/src/reporting.ts', 'buildOperationalInsights');
has('services/api/src/reporting.ts', 'schemaCapabilities');
has('services/api/src/reporting.ts', 'reports.view');
has('services/api/src/reporting.ts', 'inventoryScope');
has('services/api/src/reporting.ts', 'brand_i.organization_id');
has('services/api/src/http.ts', "pathname === '/v1/reports/operational'");
has('services/api/src/http.ts', "pathname === '/v1/reports/operational.csv'");
has('services/api/src/reporting-export.ts', 'reports.export');
has('services/api/src/reporting.ts', "reportVersion: '7.3'");
has('apps/web/lib/api.ts', 'getOperationalReportApi');
has('apps/web/app/reports/page.tsx', 'OPERATIONAL SIGNALS');
has('apps/web/app/reports/page.tsx', 'HOW THIS REPORT IS PREPARED');
has('apps/web/app/reports/page.tsx', 'PAYMENT MIX • CASH VS LOAN');
has('apps/web/app/reports/page.tsx', 'Export CSV');
has('services/outbox-worker/src/projector.ts', 'projectProductDaily');
has('services/outbox-worker/src/projector.ts', 'projectCommissionDaily');
has('services/outbox-worker/src/projector.ts', 'read_model_product_daily');
has('services/outbox-worker/src/projector.ts', 'read_model_commission_daily');
has('database/migrations/20261004_000030_phase7_reporting_read_models.sql', 'read_model_product_daily');
has('database/migrations/20261004_000030_phase7_reporting_read_models.sql', 'read_model_commission_daily');
has('database/migrations/20261004_000030_phase7_reporting_read_models.sql', 'read_model_reporting_freshness');
has('database/migrations/20261004_000030_phase7_reporting_read_models.sql', 'sale_level');
has('database/migrations/20261004_000030_phase7_reporting_read_models.sql', 'requires completed/reversed sales to have region_id and team_id');

const packageJson = JSON.parse(read('package.json'));
if (packageJson.scripts?.['validate:phase7'] !== 'node scripts/validate-phase7.mjs') failures.push('package.json: missing validate:phase7 script');
if (packageJson.scripts?.['test:phase7'] !== 'node --experimental-strip-types tests/unit/phase7-reporting.test.mjs') failures.push('package.json: missing test:phase7 script');

const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|mjs|cjs|sql)$/.test(entry.name)) sourceFiles.push(full);
  }
}
walk(root);
for (const file of sourceFiles) {
  const rel = path.relative(root, file);
  const source = fs.readFileSync(file, 'utf8');
  if (/\b(?:drop\s+(?:table|schema)|truncate(?:\s+table)?|delete\s+from)\s+(?:public\.)?products\b/i.test(source)) {
    failures.push(`${rel}: destructive products operation detected`);
  }
}

if (/sale_datetime/.test(read('services/api/src/reporting.ts')) && !read('services/api/src/reporting.ts').includes('schemaCapabilities')) failures.push('reporting.ts uses sale_datetime without capability fallback');
if (read('services/outbox-worker/src/projector.ts').includes('sale_datetime')) failures.push('projector.ts must remain compatible with pre-Phase-4 live schema');
if (read('services/outbox-worker/src/projector.ts').includes('owner_user_id')) failures.push('projector.ts must not depend on future customer scope columns');

console.log(`Stage 7 validator scanned ${sourceFiles.length} active source/migration files.`);
if (failures.length) {
  console.error(`Stage 7 validation FAILED (${failures.length} checks)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Stage 7 validation PASSED: reporting contract, read models, authorization, deploy routing, prior-schema compatibility, and non-destructive product guardrails are present.');
