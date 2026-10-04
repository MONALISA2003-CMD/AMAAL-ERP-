import assert from 'node:assert/strict';
import test from 'node:test';
import { AI_TOOL_POLICIES, authorizedToolNames, toOpenAITools } from '../../apps/amaal-ai/src/contracts.ts';
import { routeAmaalAI } from '../../apps/amaal-ai/src/router.ts';

const baseContext = (overrides = {}) => ({
  userId: 'u1',
  roles: ['AGENT'],
  permissions: ['ai.use','inventory.view','sales.view','reports.view','customers.view','recovery.view','commissions.view','ai.knowledge.view'],
  regionIds: ['r1'],
  teamIds: ['t1'],
  shopIds: [],
  subregionIds: [],
  ...overrides,
});

test('read-only recovery questions do not expose action tools', () => {
  const route = routeAmaalAI('Which agents have the highest aging exposure today?');
  assert.equal(route.risk, 'LOW');
  assert.equal(route.candidateTools.includes('create_recovery_case'), false);
});

test('explicit inventory action requests expose only prepare tools', () => {
  const route = routeAmaalAI('Prepare a transfer request for this device to Team B.');
  assert.equal(route.risk, 'HIGH');
  assert.deepEqual(route.candidateTools.filter((name) => name.startsWith('prepare_')), ['prepare_transfer_request','prepare_adjustment_request']);
  assert.equal(route.candidateTools.includes('create_recovery_case'), false);
});

test('critical or privileged requests never expose write-capable tools', () => {
  const route = routeAmaalAI('Disable user access and change their permission.');
  assert.equal(route.risk, 'CRITICAL');
  assert.ok(route.candidateTools.every((name) => AI_TOOL_POLICIES[name].risk !== 'HIGH' && AI_TOOL_POLICIES[name].risk !== 'CRITICAL'));
});

test('tool exposure is permission-filtered server-side', () => {
  const context = baseContext({ permissions: ['ai.use','inventory.view'] });
  const tools = authorizedToolNames(context, ['get_my_stock','get_sales','search_knowledge','create_recovery_case']);
  assert.deepEqual(tools, ['get_my_stock']);
});

test('CEO may see an explicitly requested governed tool without inventing a new permission', () => {
  const context = baseContext({ roles: ['CEO'], permissions: [] });
  const tools = authorizedToolNames(context, ['get_sales','search_knowledge','prepare_approval_request']);
  assert.deepEqual(tools, ['get_sales','search_knowledge','prepare_approval_request']);
});

test('critical financial/security tools are absent from the Stage 8 policy registry', () => {
  const names = Object.keys(AI_TOOL_POLICIES);
  assert.equal(names.some((name) => /delete|password|write[_ ]off|change[_ ]role/.test(name)), false);
  assert.equal(names.includes('run_sql'), false);
  assert.equal(names.includes('approve_action'), false);
});

test('OpenAI function tools carry strict schemas except the intentionally open approval payload', () => {
  const generated = toOpenAITools(['get_sales','prepare_approval_request']);
  assert.equal(generated[0].strict, true);
  assert.equal(generated[1].strict, false);
});

test('high-risk action policies require preparation autonomy', () => {
  for (const name of ['create_task','create_recovery_case','prepare_transfer_request','prepare_adjustment_request','prepare_approval_request']) {
    const policy = AI_TOOL_POLICIES[name];
    assert.equal(policy.risk, 'HIGH');
    assert.equal(policy.autonomy, 3);
  }
});


test('cross-domain operational questions stay read-only while exposing only the governed union', () => {
  const route = routeAmaalAI('Show me regional sales performance and current stock by region.');
  assert.equal(route.risk, 'LOW');
  assert.ok(route.candidateTools.includes('get_sales'));
  assert.ok(route.candidateTools.includes('get_region_stock'));
  assert.equal(route.candidateTools.some((name) => AI_TOOL_POLICIES[name].risk === 'HIGH'), false);
});

test('governance policy versions are explicit constants', async () => {
  const module = await import('../../apps/amaal-ai/src/contracts.ts');
  assert.equal(module.AI_GOVERNANCE_VERSION, '8.2');
  assert.equal(module.AI_TOOL_POLICY_VERSION, '2026-10-04.2');
});
