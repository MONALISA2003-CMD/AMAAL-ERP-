import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'apps/web/app/api/amaal/[...path]/route.ts',
  'apps/web/app/organization/page.tsx',
  'services/api/src/organization.ts',
  'database/migrations/20261002_000020_phase2b_organization_identity_integrity.sql',
  'docs/phase2/AMAAL_PHASE2B_IDENTITY_AND_ORGANIZATION.md',
];
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`Missing Phase 2B file: ${rel}`);
}
const api = fs.readFileSync(path.join(root,'services/api/src/organization.ts'),'utf8');
const http = fs.readFileSync(path.join(root,'services/api/src/http.ts'),'utf8');
const client = fs.readFileSync(path.join(root,'apps/web/lib/api.ts'),'utf8');
const proxy = fs.readFileSync(path.join(root,'apps/web/app/api/amaal/[...path]/route.ts'),'utf8');
const migration = fs.readFileSync(path.join(root,'database/migrations/20261002_000020_phase2b_organization_identity_integrity.sql'),'utf8');
const assertions = [
  [api.includes('getOrganizationDirectory'), 'organization directory service'],
  [api.includes('provisionPerson'), 'identity provisioning service'],
  [http.includes('/v1/org/directory'), 'directory route'],
  [http.includes('/v1/org/people'), 'identity provisioning route'],
  [client.includes("return '/api/amaal'"), 'browser same-origin API fallback'],
  [proxy.includes('amaal-api.onrender.com'), 'Vercel→Render proxy'],
  [migration.includes('team_memberships_one_active_team_leader'), 'one active team leader index'],
  [migration.includes('team_memberships_one_active_user'), 'one active team membership index'],
  [migration.includes("Use Amaal AI"), 'Amaal AI permission terminology'],
];
for (const [ok,label] of assertions) if (!ok) throw new Error(`Phase 2B validation failed: ${label}`);
console.log(`Phase 2B validation passed (${assertions.length} checks).`);
