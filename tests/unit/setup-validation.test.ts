import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSetupInitializeInput } from '../../services/api/src/setup.ts';

test('setup validation accepts a complete organization foundation', () => {
  const result = validateSetupInitializeInput({
    activationCode: 'sample-activation-code',
    ceoEmail: 'ceo@example.com',
    ceoDisplayName: 'Amaal CEO',
    ceoEmployeeNumber: 'CEO-001',
    regions: [
      { code: 'CENTRAL', name: 'Central' },
      { code: 'EASTERN', name: 'Eastern' },
    ],
    regionalWarehouses: [
      { code: 'CENTRAL-01', name: 'Central Warehouse', regionCode: 'CENTRAL' },
      { code: 'EASTERN-01', name: 'Eastern Warehouse', regionCode: 'EASTERN' },
    ],
  });
  assert.equal(result.ceoEmail, 'ceo@example.com');
  assert.equal(result.regions.length, 2);
  assert.equal(result.regionalWarehouses.length, 2);
});

test('setup validation rejects duplicate region codes', () => {
  assert.throws(
    () => validateSetupInitializeInput({
      activationCode: 'sample-activation-code',
      ceoEmail: 'ceo@example.com',
      ceoDisplayName: 'Amaal CEO',
      regions: [
        { code: 'CENTRAL', name: 'Central' },
        { code: 'central', name: 'Central 2' },
      ],
      regionalWarehouses: [],
    }),
    /duplicated/,
  );
});

test('setup validation rejects a warehouse that references an unknown region', () => {
  assert.throws(
    () => validateSetupInitializeInput({
      activationCode: 'sample-activation-code',
      ceoEmail: 'ceo@example.com',
      ceoDisplayName: 'Amaal CEO',
      regions: [{ code: 'CENTRAL', name: 'Central' }],
      regionalWarehouses: [{ code: 'EAST-01', name: 'Eastern Warehouse', regionCode: 'EASTERN' }],
    }),
    /unknown region/,
  );
});
