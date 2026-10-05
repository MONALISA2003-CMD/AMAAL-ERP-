import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const root = process.cwd();
const failures = [];
const warnings = [];
const workspaceGlobs = ['apps', 'packages', 'services', 'workers'];
const manifests = [];

function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function fail(message) { failures.push(message); }
function warn(message) { warnings.push(message); }

for (const base of workspaceGlobs) {
  const dir = join(root, base);
  if (!existsSync(dir)) continue;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(dir, entry.name, 'package.json');
    if (existsSync(path)) manifests.push({ path, dir: resolve(dir, entry.name), pkg: readJson(path) });
  }
}

const byName = new Map();
for (const item of manifests) {
  const name = item.pkg.name;
  if (!name) fail(`workspace manifest without name: ${item.path}`);
  else if (byName.has(name)) fail(`duplicate workspace package name: ${name}`);
  else byName.set(name, item);
}

if (manifests.length !== 16) fail(`expected 16 workspace packages, found ${manifests.length}`);

for (const item of manifests) {
  for (const section of ['dependencies','devDependencies','optionalDependencies','peerDependencies']) {
    const deps = item.pkg[section] ?? {};
    for (const [dep, spec] of Object.entries(deps)) {
      if (!dep.startsWith('@amaal/') || !byName.has(dep)) continue;
      if (typeof spec !== 'string' || !spec.startsWith('file:')) {
        fail(`${item.pkg.name} -> ${dep} must use a local file: dependency; found ${String(spec)}`);
        continue;
      }
      const target = resolve(item.dir, spec.slice(5));
      if (!existsSync(join(target, 'package.json'))) fail(`${item.pkg.name} -> ${dep} points to missing ${relative(root, target)}`);
      const targetPkg = readJson(join(target, 'package.json'));
      if (targetPkg.name !== dep) fail(`${item.pkg.name} -> ${dep} points to ${targetPkg.name ?? 'unnamed'} at ${relative(root, target)}`);
    }
  }
}

const rootPkg = readJson(join(root, 'package.json'));
if (rootPkg.packageManager) fail(`root packageManager must be absent for deployment; found ${rootPkg.packageManager}`);
if (JSON.stringify(rootPkg.workspaces) !== JSON.stringify(['apps/*','packages/*','services/*','workers/*'])) fail('root npm workspaces are not the expected monorepo globs');

const vercel = readJson(join(root, 'vercel.json'));
const render = readFileSync(join(root, 'render.yaml'), 'utf8');
const zipSync = readFileSync(join(root, '.github/workflows/zip-sync.yml'), 'utf8');
if (/pnpm/i.test(`${vercel.installCommand} ${vercel.buildCommand}`)) fail('active Vercel commands still reference pnpm');
if (!/cd apps\/web && npm install/.test(vercel.installCommand)) fail('Vercel install must remain standalone apps/web npm install');
if (!/cd apps\/web && npm run build/.test(vercel.buildCommand)) fail('Vercel build must remain standalone apps/web npm build');
if (/pnpm install|pnpm@/i.test(render)) fail('render.yaml contains an active pnpm deployment command');
if (/type d \\n/.test(zipSync) || /-type d .*\\n/.test(zipSync)) fail('zip-sync workflow contains a literal backslash-n inside a shell command');
if (!/buildCommand:\s*npm install --no-audit --no-fund --package-lock=false/.test(render)) fail('Render blueprint must use npm install --no-audit --no-fund --package-lock=false');

const webApi = readFileSync(join(root, 'apps/web/lib/api.ts'), 'utf8');
const webPage = readFileSync(join(root, 'apps/web/app/ai/page.tsx'), 'utf8');
const aiAudit = readFileSync(join(root, 'apps/amaal-ai/src/audit.ts'), 'utf8');
const planType = webApi.match(/export type AmaalAIActionPlan = \{[\s\S]*?\n\};/);
if (!planType || !/expiresAt:\s*string\s*\|\s*null/.test(planType[0])) fail('web AmaalAIActionPlan type is missing expiresAt: string | null');
if (/plan\.expiresAt/.test(webPage) && !/expires_at::text as "expiresAt"/.test(aiAudit)) fail('AI page consumes expiresAt but the server action-plan projection does not return it');

const internalZero = [];
for (const item of manifests) {
  for (const section of ['dependencies','devDependencies','optionalDependencies','peerDependencies']) {
    for (const [dep, spec] of Object.entries(item.pkg[section] ?? {})) {
      if (dep.startsWith('@amaal/') && byName.has(dep) && spec === '0.0.0') internalZero.push(`${item.pkg.name} -> ${dep}`);
    }
  }
}
if (internalZero.length) fail(`internal workspace dependencies still use registry-looking 0.0.0 specs: ${internalZero.join(', ')}`);

// These are informational, not failures, because the production lockfile is deliberately generated in network-capable CI.
if (!existsSync(join(root, 'package-lock.json'))) warn('package-lock.json is not committed; release reproducibility remains a CI lock-generation gate.');
if (!existsSync(join(root, 'services/intelligence/uv.lock'))) warn('services/intelligence/uv.lock is not committed; Python reproducibility remains a CI lock-generation gate.');

console.log(`Workspace packages audited: ${manifests.length}`);
console.log(`Failures: ${failures.length}`);
for (const item of failures) console.error(`FAIL: ${item}`);
console.log(`Warnings: ${warnings.length}`);
for (const item of warnings) console.warn(`WARN: ${item}`);
if (failures.length) process.exit(1);
console.log('FORENSIC DEPLOYMENT AUDIT: PASS');
