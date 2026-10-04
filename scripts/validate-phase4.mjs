import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
function read(rel){
  const p=path.join(root,rel); if(!fs.existsSync(p)){failures.push(`missing: ${rel}`); return '';}
  return fs.readFileSync(p,'utf8');
}
function has(rel, pattern, label=pattern){ const s=read(rel); if(!s.includes(pattern)) failures.push(`${rel}: missing ${label}`); }
function file(rel){ if(!fs.existsSync(path.join(root,rel))) failures.push(`missing file: ${rel}`); }

for (const f of [
  'database/migrations/20261004_000026_phase4_sales_finance_hardening.sql',
  'database/migrations/20261004_000027_phase4_finance_integrity_and_corrections.sql',
  'database/migrations/20261004_000028_phase4_deep_finance_hardening.sql',
  'services/customers/src/index.ts',
  'services/sales/src/index.ts',
  'services/sales/src/service.ts',
  'services/finance/src/commission.ts',
  'services/finance/src/ledger.ts',
  'services/finance/src/payments.ts',
  'services/finance/src/receipts.ts',
  'services/finance/src/loan-providers.ts',
  'services/finance/src/phase4-finance-rules.ts',
  'apps/web/app/customers/page.tsx',
  'apps/web/app/sales/page.tsx',
  'apps/web/app/finance/page.tsx',
  'docs/phase4/AMAAL_PHASE4_SALES_FINANCE.md',
  'docs/phase4/AMAAL_PHASE4_LOGIN_AUTHORITY.md',
  'docs/AMAAL_PHASE4_RELEASE_GATE_2026-10-04.md',
]) file(f);

has('database/migrations/20261004_000026_phase4_sales_finance_hardening.sql', "'customers.assign'");
has('database/migrations/20261004_000026_phase4_sales_finance_hardening.sql', 'customer_assignments');
has('database/migrations/20261004_000027_phase4_finance_integrity_and_corrections.sql', 'validate_sale_finance_contract');
has('database/migrations/20261004_000027_phase4_finance_integrity_and_corrections.sql', 'prevent_referenced_price_policy_mutation');
has('database/migrations/20261004_000027_phase4_finance_integrity_and_corrections.sql', 'payment_adjustments');
has('database/migrations/20261004_000028_phase4_deep_finance_hardening.sql', 'payment_adjustments_original_uq');
has('database/migrations/20261004_000028_phase4_deep_finance_hardening.sql', 'prevent_payment_adjustment_chain');
has('database/migrations/20261004_000028_phase4_deep_finance_hardening.sql', 'prevent_receipt_identity_mutation');
has('database/migrations/20261004_000028_phase4_deep_finance_hardening.sql', 'prevent_overlapping_bonus_policy');
has('database/migrations/20261004_000028_phase4_deep_finance_hardening.sql', "delete from public.role_permissions");
has('database/migrations/20261004_000028_phase4_deep_finance_hardening.sql', "role='ADMIN'::public.role_key");

has('services/sales/src/service.ts', 'All IMEIs in one sale must resolve to the same region, team and shop custody scope.');
has('services/sales/src/service.ts', 'organization_id=$2 and status=\'ACTIVE\'');
has('services/sales/src/service.ts', 'validateSalePaymentContract');
has('services/finance/src/commission.ts', 'limit 25');
has('services/finance/src/commission.ts', 'policyConditionsMatch');
has('services/finance/src/commission.ts', 'conditions:policy.conditions');
has('services/finance/src/payments.ts', 'Replacement payments cannot be adjusted again');
has('services/finance/src/payments.ts', 'payment_adjustments where original_payment_id=$1');
has('services/finance/src/ledger.ts', 'Only the CEO may create or activate commission policies.');
has('services/finance/src/ledger.ts', 'Only the CEO may create or activate bonus policies.');
has('services/catalog/src/service.ts', 'Only the CEO may create or activate price policies.');
has('services/finance/src/phase4-finance-rules.ts', 'validateSalePaymentContract');
has('services/finance/src/phase4-finance-rules.ts', 'policyConditionsMatch');
has('services/customers/src/index.ts', 'previous_subregion_id');
has('services/api/src/http.ts', "'/v1/finance/payment-adjustments'");
has('services/api/src/index.ts', 'listPaymentAdjustments');
has('apps/web/lib/api.ts', 'listPaymentAdjustmentsApi');
has('apps/web/app/dashboard/page.tsx', 'href="/customers"');
has('apps/web/app/dashboard/page.tsx', 'href="/sales"');
has('apps/web/app/dashboard/page.tsx', 'href="/finance"');

// Verify the login hierarchy is explicit in both executable and documentation layers.
has('database/migrations/20261003_000025_phase3_reconciliation_and_hierarchy_exactness.sql', "Admins can recruit Regional Managers, Managers, Team Leaders, Agents and Shop Owners only");
has('database/migrations/20261003_000025_phase3_reconciliation_and_hierarchy_exactness.sql', "CEO may create or invite Admins only");
has('docs/phase4/AMAAL_PHASE4_LOGIN_AUTHORITY.md', 'CEO | Admins only');

if(failures.length){ console.error(`Phase 4 validation FAILED (${failures.length} checks)`); for(const f of failures) console.error(`- ${f}`); process.exit(1); }
console.log('Phase 4 validation PASSED (all structural checks).');
