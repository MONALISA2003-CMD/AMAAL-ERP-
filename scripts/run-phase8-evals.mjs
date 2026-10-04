import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { AI_TOOL_POLICIES, authorizedToolNames, toOpenAITools } from '../apps/amaal-ai/src/contracts.ts';
import { routeAmaalAI } from '../apps/amaal-ai/src/router.ts';
import { guardAmaalAIOutput } from '../apps/amaal-ai/src/output-guardrails.ts';

const root = process.cwd();
const cases = JSON.parse(readFileSync(join(root,'apps/amaal-ai/evals/stage8-eval-cases.json'),'utf8'));
let passed = 0;
for (const testCase of cases) {
  if (testCase.type === 'route') {
    const route = routeAmaalAI(testCase.input);
    const expect = testCase.expect ?? {};
    if (expect.risk) assert.equal(route.risk, expect.risk, testCase.id);
    if (expect.agent) assert.equal(route.agent, expect.agent, testCase.id);
    for (const name of expect.containsTools ?? []) assert.ok(route.candidateTools.includes(name), `${testCase.id}: missing tool ${name}`);
    for (const name of expect.excludesTools ?? []) assert.equal(route.candidateTools.includes(name), false, `${testCase.id}: exposed tool ${name}`);
    for (const risk of expect.excludesRisk ?? []) assert.equal(route.candidateTools.some((name) => AI_TOOL_POLICIES[name].risk === risk), false, `${testCase.id}: exposed ${risk} tool`);
  } else if (testCase.type === 'auth') {
    const context = {userId:'eval-user',roles:testCase.roles,permissions:testCase.permissions,regionIds:['r1'],teamIds:['t1'],shopIds:[],subregionIds:[]};
    assert.deepEqual(authorizedToolNames(context,testCase.candidates),testCase.expect.tools,testCase.id);
  } else if (testCase.type === 'output') {
    const result = guardAmaalAIOutput(testCase.input);
    assert.equal(result.blocked,testCase.expect.blocked,testCase.id);
    if (testCase.expect.category) assert.ok(result.categories.includes(testCase.expect.category),`${testCase.id}: missing category ${testCase.expect.category}`);
  } else if (testCase.type === 'contract') {
    if (testCase.expect.exists === false) assert.equal(Object.prototype.hasOwnProperty.call(AI_TOOL_POLICIES,testCase.tool),false,testCase.id);
    else {
      const policy = AI_TOOL_POLICIES[testCase.tool];
      assert.ok(policy,testCase.id);
      const tool = toOpenAITools([testCase.tool])[0];
      assert.equal(tool.strict,testCase.expect.strict,testCase.id);
      assert.equal(policy.risk,testCase.expect.risk,testCase.id);
    }
  } else {
    throw new Error(`Unknown eval type ${testCase.type}`);
  }
  passed += 1;
}
console.log(`Stage 8 Evaluation Center PASS — ${passed}/${cases.length} deterministic cases`);
