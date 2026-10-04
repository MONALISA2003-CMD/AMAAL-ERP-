import assert from 'node:assert/strict';
import test from 'node:test';
import { routeAmaalAI } from '../../apps/amaal-ai/src/router.ts';

test('predictive questions never expose mutation tools',()=>{
  const cases=[
    'Forecast sales for next week',
    'Which agents have the highest aging risk?',
    'Optimize stock for next month',
    'Detect unusual seller performance',
  ];
  for(const q of cases){
    const r=routeAmaalAI(q);
    assert.ok(!r.candidateTools.some(t=>t.startsWith('create_')||t.startsWith('prepare_')),q);
  }
});
