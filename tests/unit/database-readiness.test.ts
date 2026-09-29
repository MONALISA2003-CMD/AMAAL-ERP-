import assert from 'node:assert/strict';
import test from 'node:test';
import { healthcheck } from '../../packages/database/src/postgres.ts';

function poolThatRejects(error: unknown) {
  return {
    async query() { throw error; },
  } as never;
}

test('healthcheck sanitizes postgres authentication failures', async () => {
  const result = await healthcheck(poolThatRejects(Object.assign(new Error('password=SECRET host=db.example'), { code: '28P01' })));
  assert.deepEqual(result, {
    ok: false,
    errorCode: '28P01',
    errorName: 'Error',
    errorClass: 'authentication',
  });
  assert.equal('password' in result, false);
});

test('healthcheck classifies connection timeouts', async () => {
  const result = await healthcheck(poolThatRejects(Object.assign(new Error('socket timeout'), { code: 'ETIMEDOUT' })));
  assert.deepEqual(result, {
    ok: false,
    errorCode: 'ETIMEDOUT',
    errorName: 'Error',
    errorClass: 'timeout',
  });
});
