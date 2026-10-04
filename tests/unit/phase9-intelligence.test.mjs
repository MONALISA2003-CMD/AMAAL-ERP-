import assert from 'node:assert/strict';
import test from 'node:test';
import { routeAmaalAI } from '../../apps/amaal-ai/src/router.ts';

 test('Stage 9 route exposes forecast tooling for forecast questions', () => {
  const route = routeAmaalAI('Which products are likely to sell fastest next week?');
  assert.ok(route.candidateTools.includes('get_demand_forecast'));
 });

 test('Stage 9 route exposes risk and recovery intelligence for aging questions', () => {
  const route = routeAmaalAI('Which agents have the highest aging risk and recovery priority?');
  assert.ok(route.candidateTools.includes('get_aging_risk'));
  assert.ok(route.candidateTools.includes('get_recovery_priority'));
 });

 test('Stage 9 route stays read-only for predictive questions', () => {
  const route = routeAmaalAI('Give me an aging risk forecast.');
  assert.equal(route.risk, 'LOW');
  assert.ok(!route.candidateTools.some((name) => name.startsWith('create_') || name.startsWith('prepare_')));
 });
