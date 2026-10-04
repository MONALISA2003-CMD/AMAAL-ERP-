import assert from 'node:assert/strict';
import test from 'node:test';
import { ageBand, concentration, percentChange, periodWindow, resolveAgeBands } from '../../services/api/src/reporting-math.ts';

test('all Phase 7 report periods resolve to deterministic UTC windows', () => {
  const now = new Date('2026-10-04T10:30:00.000Z');
  for (const period of ['TODAY', 'WEEK', 'MONTH', '3M', '6M', '12M']) {
    const window = periodWindow(period, now);
    assert.equal(window.from.endsWith('Z'), true);
    assert.ok(new Date(window.from) < new Date(window.to));
    assert.ok(new Date(window.previousFrom) < new Date(window.previousTo));
    assert.ok(new Date(window.previousTo) <= new Date(window.from));
  }
});

test('default Amaal aging bands are exact for the approved 18-day policy', () => {
  const bands = resolveAgeBands({ warningDays: 8, maximumDays: 18, criticalOverdueDays: 4 });
  assert.deepEqual(bands.green, { minDays: 1, maxDays: 7 });
  assert.deepEqual(bands.orange, { minDays: 8, maxDays: 13 });
  assert.deepEqual(bands.red, { minDays: 14, maxDays: 17 });
  assert.deepEqual(bands.purple, { minDays: 18, maxDays: null });
  assert.equal(ageBand(0, bands), 'UNAGED');
  assert.equal(ageBand(7, bands), 'GREEN');
  assert.equal(ageBand(8, bands), 'ORANGE');
  assert.equal(ageBand(14, bands), 'RED');
  assert.equal(ageBand(18, bands), 'PURPLE');
});

test('stored aging configuration overrides fallback defaults', () => {
  const bands = resolveAgeBands({
    warningDays: 10,
    maximumDays: 20,
    criticalOverdueDays: 5,
    configured: {
      green: { minDays: 1, maxDays: 5 },
      orange: { minDays: 6, maxDays: 9 },
      red: { minDays: 10, maxDays: 19 },
      purple: { minDays: 20, maxDays: null },
    },
  });
  assert.equal(ageBand(6, bands), 'ORANGE');
  assert.equal(ageBand(19, bands), 'RED');
  assert.equal(ageBand(20, bands), 'PURPLE');
});

test('percent change distinguishes zero baseline from zero change', () => {
  assert.equal(percentChange(0, 0), 0);
  assert.equal(percentChange(10, 0), null);
  assert.equal(percentChange(120, 100), 20);
  assert.equal(percentChange(80, 100), -20);
});

test('HHI concentration is deterministic and bounds the two standard cases', () => {
  assert.deepEqual(concentration([]), { totalUnits: 0, topSharePct: 0, hhi: 0 });
  assert.equal(concentration([100]).hhi, 10000);
  assert.equal(concentration([50, 50]).hhi, 5000);
  assert.equal(concentration([50, 50]).topSharePct, 50);
});
