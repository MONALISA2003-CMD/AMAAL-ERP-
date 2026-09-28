import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateCommissionAmount } from '../../../services/finance/src/commission-rules.js';

test('fixed commission uses the policy amount and rounds to cents', () => {
  assert.equal(calculateCommissionAmount({ calculation_type: 'FIXED_AMOUNT', amount: 12500.456 }, 700000), 12500.46);
});

test('percentage commission uses sale amount and rounds to cents', () => {
  assert.equal(calculateCommissionAmount({ calculation_type: 'PERCENT_OF_SALE', rate: 2.5 }, 799999), 19999.98);
});

test('zero commission is representable without inventing a default', () => {
  assert.equal(calculateCommissionAmount({ calculation_type: 'FIXED_AMOUNT', amount: 0 }, 500000), 0);
});

test('negative sale amount is rejected', () => {
  assert.throws(() => calculateCommissionAmount({ calculation_type: 'PERCENT_OF_SALE', rate: 2 }, -1), /saleAmount/);
});
