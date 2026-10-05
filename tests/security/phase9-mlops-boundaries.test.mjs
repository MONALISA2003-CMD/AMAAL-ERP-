import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('production MLOps migration is derived-only',()=>{
  const sql=readFileSync('database/migrations/20261004_000035_phase9_production_mlops.sql','utf8');
  assert.doesNotMatch(sql,/delete\s+from\s+public\.(products|imei_units|sales)/i);
  assert.doesNotMatch(sql,/drop\s+table\s+public\.(products|imei_units|sales)/i);
});

test('CI uses npm and keeps reproducible lock generation explicit',()=>{
  const ci=readFileSync('.github/workflows/ci.yml','utf8');
  const locks=readFileSync('.github/workflows/generate-lockfiles.yml','utf8');
  assert.match(ci,/npm install --no-audit --no-fund/);
  assert.match(locks,/npm install --package-lock-only/);
  assert.match(locks,/git add package-lock.json/);
});
