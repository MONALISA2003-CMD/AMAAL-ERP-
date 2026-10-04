import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('production MLOps migration is derived-only',()=>{
  const sql=readFileSync('database/migrations/20261004_000035_phase9_production_mlops.sql','utf8');
  assert.doesNotMatch(sql,/delete\s+from\s+public\.(products|imei_units|sales)/i);
  assert.doesNotMatch(sql,/drop\s+table\s+public\.(products|imei_units|sales)/i);
});

test('CI refuses dependency drift in release workflow by requiring frozen installation',()=>{
  const yaml=readFileSync('.github/workflows/ci.yml','utf8');
  assert.match(yaml,/--frozen-lockfile/);
});
