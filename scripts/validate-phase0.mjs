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
for (const rel of activeFiles) {
  const value = readFileSync(join(root, rel), 'utf8');
  if (/\bJarvis\b/i.test(value)) {
    console.error(`Phase 0 validation failed — legacy assistant term remains in active file: ${rel}`);
    process.exit(1);
  }
}

console.log('Amaal Phase 0 foundation validation passed.');
