import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const registry=fs.readFileSync(path.join(root,'apps/web/lib/module-registry.ts'),'utf8');
const dashboard=fs.readFileSync(path.join(root,'apps/web/app/dashboard/page.tsx'),'utf8');
test('dashboard registry contains every top-level business module',()=>{ for(const href of ['/dashboard','/organization','/inventory','/customers','/sales','/finance','/recovery','/reports','/intelligence','/ai']) assert.ok(registry.includes(`href: '${href}'`),`missing ${href}`); });
test('dashboard shows the complete navigation list',()=>{ assert.equal(dashboard.includes('slice(0, 7)'),false); assert.ok(dashboard.includes('module-pills')); });
