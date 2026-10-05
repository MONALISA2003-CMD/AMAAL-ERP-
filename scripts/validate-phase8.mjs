import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const checks = [];
const pass = (name, ok, detail = '') => {
  checks.push({name,ok,detail});
  if (!ok) throw new Error(`${name}${detail ? ` — ${detail}` : ''}`);
};
const read = (p) => readFileSync(join(root,p),'utf8');

const requiredFiles = [
  'apps/amaal-ai/src/contracts.ts',
  'apps/amaal-ai/src/router.ts',
  'apps/amaal-ai/src/gateway.ts',
  'apps/amaal-ai/src/knowledge.ts',
  'apps/amaal-ai/src/audit.ts',
  'apps/amaal-ai/src/orchestrator.ts',
  'apps/amaal-ai/src/index.ts',
  'apps/web/app/ai/page.tsx',
  'database/migrations/20261004_000031_phase8_ai_operations.sql',
  'database/migrations/20261004_000032_phase8_ai_governance_versioning.sql',
  'database/migrations/20261004_000033_phase8_ai_tool_policy_versioning.sql',
  'tests/unit/phase8-ai-policy.test.mjs',
  'tests/unit/phase8-output-guardrails.test.mjs',
  'scripts/run-phase8-evals.mjs',
  'apps/amaal-ai/evals/stage8-eval-cases.json',
];
for (const file of requiredFiles) pass(`required ${file}`, statSync(join(root,file)).isFile());

const contracts = read('apps/amaal-ai/src/contracts.ts');
const gateway = read('apps/amaal-ai/src/gateway.ts');
const knowledge = read('apps/amaal-ai/src/knowledge.ts');
const orchestrator = read('apps/amaal-ai/src/orchestrator.ts');
const router = read('apps/amaal-ai/src/router.ts');
const migration = read('database/migrations/20261004_000031_phase8_ai_operations.sql');
const web = read('apps/web/app/ai/page.tsx');
const apiPackage = JSON.parse(read('services/api/package.json'));
const env = read('.env.example');
const guardrails = read('apps/amaal-ai/src/output-guardrails.ts');
const evalCases = JSON.parse(read('apps/amaal-ai/evals/stage8-eval-cases.json'));

pass('AI tool contract has governed read/action registry', contracts.includes('AI_TOOL_POLICIES') && contracts.includes('create_recovery_case'));
pass('No raw SQL tool is present', !contracts.includes("'run_sql'") && !contracts.includes('runSql'));
pass('Gateway uses explicit tool switch rather than model-directed SQL', gateway.includes('switch (call.tool)') && !gateway.includes('executeRawSql'));
pass('Orchestrator bounds tool rounds', orchestrator.includes('const MAX_TOOL_ROUNDS = 6') && orchestrator.includes('round<MAX_TOOL_ROUNDS'));
pass('Orchestrator bounds provider/tool context', orchestrator.includes('MAX_MODEL_CONTEXT_CHARS') && orchestrator.includes('MAX_TOOL_OUTPUT_CHARS'));
pass('Orchestrator sends no provider-side persistence request', orchestrator.includes('store: false'));
pass('Conversation continuity is implemented', orchestrator.includes('loadRecentConversationMessages(manager'));
pass('Action tools are exposed only when requested', router.includes('if (actionRequested)'));
pass('Critical route is read-only', router.includes("candidateTools:['generate_report','search_knowledge']"));
pass('Knowledge search is permission-aware', knowledge.includes("ai.knowledge.view") && knowledge.includes('allowed_region_ids') && knowledge.includes('allowed_team_ids'));
pass('Knowledge RLS carries role/region/team scope', migration.includes('allowed_roles') && migration.includes('private.user_can_access_region') && migration.includes('private.user_can_access_team'));
pass('AI approval type is additive', migration.includes("add value if not exists 'AI_ACTION'"));
pass('AI action plans cannot self-approve', contracts.includes('prepare_approval_request') && contracts.includes('The AI cannot approve the request'));
pass('API depends on @amaal/ai workspace', apiPackage.dependencies?.['@amaal/ai'] === '0.0.0');
pass('Amaal AI environment defaults to disabled', env.includes('AMAAL_AI_ENABLED=false'));
pass('Governance and tool-policy versions are explicit', orchestrator.includes('AI_GOVERNANCE_VERSION') && orchestrator.includes('AI_TOOL_POLICY_VERSION') && read('database/migrations/20261004_000033_phase8_ai_tool_policy_versioning.sql').includes('tool_policy_version'));
pass('Provider model must be explicit when enabled', orchestrator.includes('AMAAL_AI_MODEL is required when Amaal AI is enabled.'));
pass('UI avoids exposing raw action arguments', !web.includes('JSON.stringify(plan.arguments)'));
pass('Approved recovery plans remain executable after an approval decision', read('apps/amaal-ai/src/audit.ts').includes("['PENDING_APPROVAL','APPROVED'].includes(plan.status)"));
pass('AI approval decisions require a still-pending AI plan', read('apps/amaal-ai/src/audit.ts').includes("status !== 'PENDING_APPROVAL'"));
pass('Provider tool rejection details are not echoed back to the model', !orchestrator.includes("message:error instanceof Error"));
pass('Read tools have bounded result sets', gateway.includes('limit 200') && gateway.includes('limit 500'));
pass('Transfer preparation validates the destination kind', gateway.includes("allowedTargets = new Set(['WAREHOUSE','MANAGER','TEAM','AGENT','SHOP'])"));
pass('Adversarial Stage 8 regression suite exists', statSync(join(root,'tests/unit/phase8-ai-redteam.test.mjs')).isFile());
pass('Deterministic output guardrail is wired', guardrails.includes('RAW_SQL') && guardrails.includes('SECRET') && orchestrator.includes('guardAmaalAIOutput'));
pass('Tool data is explicitly marked untrusted before model re-ingestion', orchestrator.includes('UNTRUSTED_AMAAL_DATA') && orchestrator.includes('DATA_ONLY'));
pass('Evaluation Center contains broad deterministic coverage', Array.isArray(evalCases) && evalCases.length >= 15 && new Set(evalCases.map((item) => item.id)).size === evalCases.length);
pass('Governance events are auditable', read('apps/amaal-ai/src/audit.ts').includes('recordGovernanceEvent') && orchestrator.includes('AI_TOOL_REJECTED') && orchestrator.includes('AI_OUTPUT_GUARDRAIL_BLOCKED'));

console.log(`Stage 8 validation PASS — ${checks.length} checks`);
