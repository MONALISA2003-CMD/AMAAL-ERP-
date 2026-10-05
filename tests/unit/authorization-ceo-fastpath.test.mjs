import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
const source=fs.readFileSync(path.join(process.cwd(),'packages/permissions/src/context.ts'),'utf8');
test('CEO authorization context uses a company-wide fast path',()=>{ assert.ok(source.includes("if (roleKeys.includes('CEO'))")); assert.ok(source.includes('regionIds: []')); assert.ok(source.includes('teamIds: []')); assert.ok(source.includes('shopIds: []')); });
