import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'apps/web/app/setup/page.tsx',
  'services/api/src/setup.ts',
  'apps/web/lib/api.ts',
  'docs/AMAAL_PHASE1_ARCHITECTURE.md',
  'docs/AMAAL_SETUP_IMPLEMENTATION.md',
  'tests/unit/setup-validation.test.ts',
];
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`Phase 1 validation failed — missing ${rel}`);
}
const setup = fs.readFileSync(path.join(root, 'services/api/src/setup.ts'), 'utf8');
const web = fs.readFileSync(path.join(root, 'apps/web/app/setup/page.tsx'), 'utf8');
const api = fs.readFileSync(path.join(root, 'apps/web/lib/api.ts'), 'utf8');
const tests = fs.readFileSync(path.join(root, 'tests/unit/setup-validation.test.ts'), 'utf8');
const assertions = [
  [setup.includes("REQUIRED_MAIN_REGIONS"), 'required main regions are server-enforced'],
  [setup.includes("NUWH") && setup.includes("WUWH") && setup.includes("CUWH") && setup.includes("EUWH"), 'standard regional warehouse codes are server-enforced'],
  [setup.includes('masterWarehouse'), 'master warehouse readiness is checked'],
  [setup.includes('policyReadinessRecorded'), 'policy readiness is exposed'],
  [setup.includes('ORGANIZATION_SETUP_COMPLETED'), 'setup audit event is retained'],
  [setup.includes('version: 2'), 'setup state version is advanced'],
  [web.includes("{ code: 'NORTH', name: 'North' }"), 'North default exists'],
  [web.includes("{ code: 'NUWH', name: 'Northern Uganda Warehouse', regionCode: 'NORTH' }"), 'North warehouse default exists'],
  [web.includes('setup-readiness'), 'setup completion readiness is visible'],
  [api.includes('readiness:'), 'setup readiness contract is exposed to frontend'],
  [tests.includes('missing required main region'), 'tests cover missing main region'],
  [tests.includes('missing required regional warehouse'), 'tests cover missing required warehouse'],
];
for (const [ok, label] of assertions) if (!ok) throw new Error(`Phase 1 validation failed: ${label}`);
console.log(`Amaal Phase 1 validation passed (${assertions.length} checks).`);
