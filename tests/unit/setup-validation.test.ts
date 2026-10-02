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
      { code: 'NORTH', name: 'North' },
      { code: 'WEST', name: 'West' },
      { code: 'CENTRAL', name: 'Central' },
      { code: 'EAST', name: 'East' },
    ],
    regionalWarehouses: [
      { code: 'NUWH', name: 'Northern Uganda Warehouse', regionCode: 'NORTH' },
      { code: 'WUWH', name: 'Western Uganda Warehouse', regionCode: 'WEST' },
      { code: 'CUWH', name: 'Central Uganda Warehouse', regionCode: 'CENTRAL' },
      { code: 'EUWH', name: 'Eastern Uganda Warehouse', regionCode: 'EAST' },
    ],
  });
  assert.equal(result.ceoEmail, 'ceo@example.com');
  assert.equal(result.regions.length, 4);
  assert.equal(result.regionalWarehouses.length, 4);
});

test('setup validation rejects duplicate region codes', () => {
  assert.throws(
    () => validateSetupInitializeInput({
      activationCode: 'sample-activation-code',
      ceoEmail: 'ceo@example.com',
      ceoDisplayName: 'Amaal CEO',
      regions: [
        { code: 'NORTH', name: 'North' },
        { code: 'WEST', name: 'West' },
        { code: 'CENTRAL', name: 'Central' },
        { code: 'central', name: 'Central 2' },
        { code: 'EAST', name: 'East' },
      ],
      regionalWarehouses: [
        { code: 'NUWH', name: 'Northern Uganda Warehouse', regionCode: 'NORTH' },
        { code: 'WUWH', name: 'Western Uganda Warehouse', regionCode: 'WEST' },
        { code: 'CUWH', name: 'Central Uganda Warehouse', regionCode: 'CENTRAL' },
        { code: 'EUWH', name: 'Eastern Uganda Warehouse', regionCode: 'EAST' },
      ],
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
      regions: [
        { code: 'NORTH', name: 'North' },
        { code: 'WEST', name: 'West' },
        { code: 'CENTRAL', name: 'Central' },
        { code: 'EAST', name: 'East' },
      ],
      regionalWarehouses: [
        { code: 'NUWH', name: 'Northern Uganda Warehouse', regionCode: 'NORTH' },
        { code: 'WUWH', name: 'Western Uganda Warehouse', regionCode: 'WEST' },
        { code: 'CUWH', name: 'Central Uganda Warehouse', regionCode: 'CENTRAL' },
        { code: 'EUWH', name: 'Eastern Uganda Warehouse', regionCode: 'EASTERN' },
      ],
    }),
    /unknown region/,
  );
});


test('setup validation rejects missing required main region', () => {
  assert.throws(
    () => validateSetupInitializeInput({
      activationCode: 'sample-activation-code',
      ceoEmail: 'ceo@example.com',
      ceoDisplayName: 'Amaal CEO',
      regions: [
        { code: 'NORTH', name: 'North' },
        { code: 'WEST', name: 'West' },
        { code: 'EAST', name: 'East' },
      ],
      regionalWarehouses: [
        { code: 'NUWH', name: 'Northern Uganda Warehouse', regionCode: 'NORTH' },
        { code: 'WUWH', name: 'Western Uganda Warehouse', regionCode: 'WEST' },
        { code: 'EUWH', name: 'Eastern Uganda Warehouse', regionCode: 'EAST' },
      ],
    }),
    /main regions/,
  );
});

test('setup validation rejects missing required regional warehouse', () => {
  assert.throws(
    () => validateSetupInitializeInput({
      activationCode: 'sample-activation-code',
      ceoEmail: 'ceo@example.com',
      ceoDisplayName: 'Amaal CEO',
      regions: [
        { code: 'NORTH', name: 'North' },
        { code: 'WEST', name: 'West' },
        { code: 'CENTRAL', name: 'Central' },
        { code: 'EAST', name: 'East' },
      ],
      regionalWarehouses: [
        { code: 'NUWH', name: 'Northern Uganda Warehouse', regionCode: 'NORTH' },
        { code: 'WUWH', name: 'Western Uganda Warehouse', regionCode: 'WEST' },
        { code: 'CUWH', name: 'Central Uganda Warehouse', regionCode: 'CENTRAL' },
      ],
    }),
    /regional warehouses/,
  );
});

test('setup validation rejects a standard regional warehouse attached to the wrong main region', () => {
  assert.throws(
    () => validateSetupInitializeInput({
      activationCode: 'sample-activation-code',
      ceoEmail: 'ceo@example.com',
      ceoDisplayName: 'Amaal CEO',
      regions: [
        { code: 'NORTH', name: 'North' },
        { code: 'WEST', name: 'West' },
        { code: 'CENTRAL', name: 'Central' },
        { code: 'EAST', name: 'East' },
      ],
      regionalWarehouses: [
        { code: 'NUWH', name: 'Northern Uganda Warehouse', regionCode: 'WEST' },
        { code: 'WUWH', name: 'Western Uganda Warehouse', regionCode: 'WEST' },
        { code: 'CUWH', name: 'Central Uganda Warehouse', regionCode: 'CENTRAL' },
        { code: 'EUWH', name: 'Eastern Uganda Warehouse', regionCode: 'EAST' },
      ],
    }),
    /must belong to region NORTH/,
  );
});
