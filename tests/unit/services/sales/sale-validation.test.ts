import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCreateSale } from '../../../../services/sales/src/index.ts';

test('rejects sales with no lines', () => {
  assert.throws(() => validateCreateSale({ sellerUserId: 'u', customerId: 'c', paymentType: 'CASH', lines: [] }));
});

test('accepts a valid cash sale command', () => {
  assert.doesNotThrow(() => validateCreateSale({
    sellerUserId: 'u',
    customerId: 'c',
    paymentType: 'CASH',
    lines: [{ imeiId: 'i', productVariantId: 'v', unitPrice: 100000 }],
  }));
});
