import assert from 'node:assert/strict';
import {
  DEFAULT_AGING_BANDS,
  DEFAULT_SUSPENSION_CONFIG,
  normalizeAgingBands,
  resolveAgingBand,
  deriveAgingFlags,
  qualifiesForAgentSuspension,
  qualifiesForTeamLeaderSuspension,
  qualifiesForManagerSuspension,
} from '../../packages/business-rules/src/aging.ts';

const cases = [];
function test(name, fn) { try { fn(); cases.push(`PASS ${name}`); } catch (e) { cases.push(`FAIL ${name}: ${e.message}`); throw e; } }

test('Amaal default aging bands are exact', () => {
  assert.deepEqual(DEFAULT_AGING_BANDS, {
    green: {minDays:1,maxDays:7}, orange:{minDays:8,maxDays:13}, red:{minDays:14,maxDays:17}, purple:{minDays:18,maxDays:null},
  });
});

test('boundary day 7 is GREEN', () => assert.equal(resolveAgingBand(7), 'GREEN'));
test('boundary day 8 is ORANGE', () => assert.equal(resolveAgingBand(8), 'ORANGE'));
test('boundary day 14 is RED', () => assert.equal(resolveAgingBand(14), 'RED'));
test('boundary day 18 is PURPLE', () => assert.equal(resolveAgingBand(18), 'PURPLE'));
test('aging bands reject gaps', () => assert.throws(() => normalizeAgingBands({green:{minDays:1,maxDays:7},orange:{minDays:9,maxDays:13}}), /contiguous/));
test('warning starts at policy warning day', () => assert.equal(deriveAgingFlags(8,8,18,0).isWarning, true));
test('overdue begins at maximum age', () => assert.equal(deriveAgingFlags(18,8,18,0).isOverdue, true));
test('critical begins at maximum plus critical overdue days', () => assert.equal(deriveAgingFlags(19,8,18,1).isCritical, true));
test('critical agent suspension requires four devices and 18 day oldest age', () => assert.equal(qualifiesForAgentSuspension(4,18,DEFAULT_SUSPENSION_CONFIG), true));
test('agent with three critical devices is not suspended', () => assert.equal(qualifiesForAgentSuspension(3,18,DEFAULT_SUSPENSION_CONFIG), false));
test('team leader suspension can be caused by four critical devices', () => assert.equal(qualifiesForTeamLeaderSuspension(1,4,DEFAULT_SUSPENSION_CONFIG), true));
test('manager suspension requires four aged teams', () => assert.equal(qualifiesForManagerSuspension(4,DEFAULT_SUSPENSION_CONFIG), true));
test('manager with three aged teams is not suspended', () => assert.equal(qualifiesForManagerSuspension(3,DEFAULT_SUSPENSION_CONFIG), false));

console.log(`Phase 5 aging/recovery rule tests passed: ${cases.length}`);
