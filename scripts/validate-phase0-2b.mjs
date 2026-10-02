#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'package.json',
  'pnpm-workspace.yaml',
  'apps/web/app/api/auth/[...path]/route.ts',
  'services/api/src/http.ts',
  'services/api/src/index.ts',
  'services/api/src/organization.ts',
  'services/outbox-worker/src/projector.ts',
  'packages/auth/src/server.ts',
  'packages/permissions/src/context.ts',
  'packages/permissions/src/authorization.ts',
  'database/migrations/20260928_000001_core_foundation.sql',
  'database/migrations/20260928_000003_rls_foundation.sql',
  'database/migrations/20261002_000021_phase0_2b_identity_scope_hardening.sql',
  'database/migrations/20261002_000022_phase0_2b_release_audit.sql',
  'database/migrations/20261002_000023_phase0_2b_recruitment_and_hierarchy_hardening.sql',
];

let failures = 0;
function check(name, ok, detail='') {
  if (ok) console.log(`PASS  ${name}`);
  else { console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); failures++; }
}
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

for (const rel of requiredFiles) check(`required ${rel}`, fs.existsSync(path.join(root,rel)));

const core = read('database/migrations/20260928_000001_core_foundation.sql');
check('core identity FKs target Neon Auth', !/auth\.users/i.test(core) && /neon_auth\."user"/i.test(core));
const rls = read('database/migrations/20260928_000003_rls_foundation.sql');
check('RLS establishes Neon auth.uid compatibility before policies', rls.indexOf('create or replace function auth.uid()') < rls.indexOf('create policy'));
check('RLS actor context uses amaal.actor_user_id', rls.includes("current_setting('amaal.actor_user_id', true)"));

const org = read('services/api/src/organization.ts');
check('Recovery Officer is region-scoped', /RECOVERY_OFFICER.*regionId/.test(org) && /regional_manager_user_id/.test(org));
check('controlled recruitment invitations implemented', org.includes('identity_invitations') && org.includes('createOrganizationInvitation') && org.includes('createAdminInvitation') && org.includes('acceptOrganizationInvitation'));
check('Regional Manager is a recruitable role', org.includes("RECRUITABLE_ROLES = new Set<RoleKey>(['REGIONAL_MANAGER'"));
check('invitation scope is validated transactionally', org.includes('validateInvitationScopeTx') && org.includes('for update'));
check('Manager-to-RM assignment is explicit when a region has multiple RMs', org.includes('multiple Regional Managers') && org.includes('regionalManagerUserId'));
check('Admin recruitment is controlled and profile-bound', org.includes('AdminInvitationInput') && org.includes('ADMIN_PROFILE_KEYS'));
check('admin provisioning is explicit', org.includes('provisionAdmin') && org.includes('admin_profiles'));
check('sub-regions implemented', org.includes('createSubregion') && org.includes('subregionId'));
check('invitation acceptance is transactional', org.includes('applyProvisionedIdentityTx') && org.includes('for update'));
check('Admin invitation acceptance is explicitly authorized', org.includes("allowSelf: true, auditReason: 'Accepted CEO-issued Admin invitation'"));

const http = read('services/api/src/http.ts');
check('organization directory endpoint exists', http.includes("/v1/org/directory"));
check('subregion endpoint exists', http.includes("/v1/org/subregions"));
check('recruitment invite endpoint exists', http.includes("/v1/org/invitations"));
check('admin provisioning endpoint exists', http.includes("/v1/org/admins"));
check('admin recruitment invitation endpoint exists', http.includes("/v1/org/admin-invitations"));
check('organization directory response matches frontend contract', http.includes('json(res,200,{requestId,items:directory})'));

const auth = read('packages/auth/src/server.ts');
check('Neon JWT verification exists', auth.includes('createRemoteJWKSet') && auth.includes('jwtVerify'));
check('issuer/audience verification exists', auth.includes('issuer') && auth.includes('audience'));

const webPkg = read('apps/web/package.json');
check('active web package has no Supabase Auth dependency', !webPkg.includes('@supabase/supabase-js'));
check('active runtime tests contain no Supabase environment configuration', !read('tests/unit/api-routing.test.ts').includes('SUPABASE_'));
check('Amaal AI is active terminology in permission descriptions', fs.existsSync(path.join(root,'docs/AMAAL_AI')) || !read('docs/phase0/AMAAL_ARCHITECTURE_DECISIONS.md').includes('Jarvis'));

const worker = read('services/outbox-worker/src/projector.ts');
check('realtime consumer is provider-neutral', !worker.includes('supabase-realtime-table') && worker.includes('realtime-delivery'));

const adminMigration = read('database/migrations/20261002_000021_phase0_2b_identity_scope_hardening.sql');
const lateHardeningMigration = read('database/migrations/20261002_000023_phase0_2b_recruitment_and_hierarchy_hardening.sql');
check('admin profile families exist', adminMigration.includes('public.admin_profiles') && adminMigration.includes('SYSTEM_ADMIN'));
check('identity invitation scope constraints exist', adminMigration.includes('identity_invitations_scope_fk') && adminMigration.includes('identity_invitations_manager_region_fk'));
check('late recruitment/hierarchy hardening migration exists', lateHardeningMigration.includes('identity_invitations_scope_check') && lateHardeningMigration.includes('teams_manager_region_fkey'));
check('hierarchy composite integrity constraints exist', lateHardeningMigration.includes('teams_manager_region_fkey') && lateHardeningMigration.includes('role_assignments_shop_team_fkey') && lateHardeningMigration.includes('team_memberships_shop_team_fkey'));
check('admin profile is database-governed', adminMigration.includes('admin_profile_permissions') && lateHardeningMigration.includes('app.permission_key'));
check('Admin role is ineffective without an active Admin profile', lateHardeningMigration.includes("p_role <> 'ADMIN'::public.role_key or exists") && lateHardeningMigration.includes('from public.admin_profiles ap'));
check('pending invitations are unique by email', lateHardeningMigration.includes('identity_invitations_one_pending_email'));
check('Admin invitation profile key is constrained', lateHardeningMigration.includes('identity_invitations_admin_profile_key_check'));
check('Manager resource scope resolves through managers table', lateHardeningMigration.includes('user_can_access_user') && lateHardeningMigration.includes("target.role=\'MANAGER\'::public.role_key"));
check('MFA schema is prepared but enforcement remains a runtime configuration', fs.existsSync(path.join(root,'database/migrations/20261001_000018_mfa_factors.sql')) && lateHardeningMigration.includes('user_has_permission'));


const activeRoots = ['apps','packages','services','database','tests'];
for (const rootDir of activeRoots) {
  const stack = [path.join(root, rootDir)];
  while (stack.length) {
    const current = stack.pop();
    for (const name of fs.readdirSync(current)) {
      if (['node_modules','.next','.turbo','.git'].includes(name)) continue;
      const full = path.join(current,name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) { stack.push(full); continue; }
      if (!/\.(ts|tsx|js|mjs|sql|json|md)$/i.test(name)) continue;
      const text = fs.readFileSync(full,'utf8');
      check(`no legacy Supabase Auth/runtime dependency in ${path.relative(root,full)}`, !text.includes('@supabase/supabase-js') && !/auth\.users/i.test(text));
    }
  }
}

console.log(`\nPhase 0–2B validation: ${failures ? 'FAILED' : 'PASSED'}`);
process.exitCode = failures ? 1 : 0;
