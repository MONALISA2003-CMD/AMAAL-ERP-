import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const read = (rel) => {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) { failures.push(`missing: ${rel}`); return ''; }
  return fs.readFileSync(p, 'utf8');
};
const exists = (rel) => fs.existsSync(path.join(root, rel));
const has = (rel, pattern, label=pattern) => { if (!read(rel).includes(pattern)) failures.push(`${rel}: missing ${label}`); };

for (const f of [
  'database/migrations/20261004_000029_phase5_aging_recovery_suspension_engine.sql',
  'packages/business-rules/src/aging.ts',
  'services/recovery/src/aging-engine.ts',
  'services/recovery/src/governance.ts',
  'services/recovery/src/index.ts',
  'services/api/src/index.ts',
  'services/api/src/http.ts',
  'services/outbox-worker/src/runner.ts',
  'apps/web/lib/api.ts',
  'apps/web/app/recovery/page.tsx',
  'tests/unit/phase5-aging-recovery.test.mjs',
  'docs/phase5/AMAAL_PHASE5_AGING_RECOVERY_SUSPENSION.md',
  'docs/phase5/AMAAL_PHASE5_DEEP_HARDENING_2026-10-04.md',
  'docs/AMAAL_PHASE5_RELEASE_GATE_2026-10-04.md',
]) if (!exists(f)) failures.push(`missing file: ${f}`);

has('database/migrations/20261004_000029_phase5_aging_recovery_suspension_engine.sql', "'aging.view'");
has('database/migrations/20261004_000029_phase5_aging_recovery_suspension_engine.sql', "'aging.manage'");
has('database/migrations/20261004_000029_phase5_aging_recovery_suspension_engine.sql', "'recovery.reinstate'");
has('database/migrations/20261004_000029_phase5_aging_recovery_suspension_engine.sql', 'aging_asset_states');
has('database/migrations/20261004_000029_phase5_aging_recovery_suspension_engine.sql', 'aging_state_events');
has('database/migrations/20261004_000029_phase5_aging_recovery_suspension_engine.sql', 'aging_alerts');
has('database/migrations/20261004_000029_phase5_aging_recovery_suspension_engine.sql', 'recovery_case_assignments');
has('database/migrations/20261004_000029_phase5_aging_recovery_suspension_engine.sql', 'recovery_escalations');
has('database/migrations/20261004_000029_phase5_aging_recovery_suspension_engine.sql', 'business_access_suspensions');
has('database/migrations/20261004_000029_phase5_aging_recovery_suspension_engine.sql', 'aging_policy_window_guard');
has('database/migrations/20261004_000029_phase5_aging_recovery_suspension_engine.sql', 'business_access_reinstatement_guard');
has('database/migrations/20261004_000029_phase5_aging_recovery_suspension_engine.sql', "values ('CEO'::public.role_key,'aging.view'),('CEO'::public.role_key,'aging.manage'),('CEO'::public.role_key,'recovery.reinstate')");

has('packages/business-rules/src/aging.ts', 'DEFAULT_AGING_BANDS');
has('packages/business-rules/src/aging.ts', 'DEFAULT_SUSPENSION_CONFIG');
has('packages/business-rules/src/aging.ts', 'resolveAgingBand');
has('packages/business-rules/src/aging.ts', 'qualifiesForAgentSuspension');

has('services/recovery/src/aging-engine.ts', 'field_age_started_at');
has('services/recovery/src/aging-engine.ts', 'RECOVERY_PENDING');
has('services/recovery/src/aging-engine.ts', 'autoAssignRecoveryOfficer');
has('services/recovery/src/aging-engine.ts', 'escalateDueRecoveryCases');
has('services/recovery/src/aging-engine.ts', 'BUSINESS_ACCESS_SUSPENDED');
has('services/recovery/src/governance.ts', 'listAgingPolicies');
has('services/recovery/src/governance.ts', 'createAgingPolicy');
has('services/recovery/src/governance.ts', "Only the CEO may create or activate aging policies.");
has('services/recovery/src/governance.ts', "authorize(context, 'recovery.assign', { regionId");
has('services/recovery/src/governance.ts', 'ownerUserId: typeof row.holderUserId');

has('services/api/src/index.ts', 'listAgingPolicies');
has('services/api/src/index.ts', 'createAgingPolicy');
has('services/api/src/http.ts', "'/v1/aging/policies'");
has('services/api/src/http.ts', '/v1/recovery/cases');
has('services/outbox-worker/src/runner.ts', 'AgingRecoveryEngine');
has('services/outbox-worker/src/runner.ts', 'lastAgingRecovery');
has('apps/web/lib/api.ts', 'listAgingPoliciesApi');
has('apps/web/lib/api.ts', 'createAgingPolicyApi');
has('apps/web/app/recovery/page.tsx', 'CEO-controlled policy versions');
has('apps/web/app/recovery/page.tsx', 'ACTIVE SUSPENSIONS');

// Regression guard: user-mandated login authority must remain intact.
const hierarchy = read('database/migrations/20261003_000025_phase3_reconciliation_and_hierarchy_exactness.sql');
const org = read('services/api/src/organization.ts');
has('database/migrations/20261003_000025_phase3_reconciliation_and_hierarchy_exactness.sql', 'CEO may create or invite Admins only');
has('services/api/src/organization.ts', 'Admins can recruit Regional Managers, Managers, Team Leaders, Agents and Shop Owners only.');
if (hierarchy.includes("actor_role='CEO'") && !hierarchy.includes("new.role::text<>'ADMIN'")) failures.push('CEO invitation hierarchy regression');

if (failures.length) {
  console.error(`Phase 5 validation FAILED (${failures.length} checks)`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log('Phase 5 validation PASSED (all structural checks).');
