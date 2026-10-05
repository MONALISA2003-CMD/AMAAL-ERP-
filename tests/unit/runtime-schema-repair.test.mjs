import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const source=fs.readFileSync(path.join(root,'services/api/src/runtime-schema.ts'),'utf8');
const migration=fs.readFileSync(path.join(root,'database/migrations/20261004_000029_phase5_aging_recovery_suspension_engine.sql'),'utf8');
test('runtime schema repair uses the authoritative Phase 5 migration',()=>{ assert.ok(source.includes('20261004_000029_phase5_aging_recovery_suspension_engine.sql')); assert.ok(migration.includes('create table if not exists public.business_access_suspensions')); assert.equal(/values [^;]+\nwhere not exists/i.test(migration),false); });
