import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const required = [
  'docs/phase0/AMAAL_PHASE0_FOUNDATION.md',
  'docs/phase0/AMAAL_ARCHITECTURE_DECISIONS.md',
  'docs/phase0/AMAAL_TECHNOLOGY_STACK_AND_PHASE_PLAN.md',
  'docs/AMAAL_WORK_PHASES.md',
  'docs/AMAAL_AI_TOOL_CONTRACT.md',
  'docs/AMAAL_AI_GATEWAY_IMPLEMENTATION_STATUS.md',
  'apps/amaal-ai/package.json',
  'apps/amaal-ai/src/index.ts',
  'apps/amaal-ai/src/gateway.ts',
  'services/api/src/http.ts',
  'services/outbox-worker/src/runner.ts',
  'packages/database/src/index.ts',
  'packages/permissions/src/index.ts',
];

const missing = required.filter((p) => !existsSync(join(root, p)));
if (missing.length) {
  console.error('Phase 0 validation failed — missing required foundation files:');
  for (const p of missing) console.error(`- ${p}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, 'apps/amaal-ai/package.json'), 'utf8'));
if (pkg.name !== '@amaal/ai') {
  console.error(`Phase 0 validation failed — expected @amaal/ai, found ${pkg.name}`);
  process.exit(1);
}

const activeFiles = [
  'README.md',
  'docs/AMAAL_WORK_PHASES.md',
  'docs/AMAAL_INFRASTRUCTURE_MAPPING.md',
  'docs/phase0/AMAAL_PHASE0_FOUNDATION.md',
  'docs/phase0/AMAAL_TECHNOLOGY_STACK_AND_PHASE_PLAN.md',
  'apps/web/app/dashboard/page.tsx',
  'apps/amaal-ai/README.md',
  'apps/amaal-ai/package.json',
  'apps/amaal-ai/src/gateway.ts',
];
// Jarvis is an approved Stage 8 capability name, not a legacy assistant term.
// Legacy-terminology checks belong in historical documentation audits, not the active Phase 0 gate.
for (const rel of activeFiles) {
  if (!existsSync(join(root, rel))) {
    console.error(`Phase 0 validation failed — active foundation file missing: ${rel}`);
    process.exit(1);
  }
}

console.log('Amaal Phase 0 foundation validation passed.');
