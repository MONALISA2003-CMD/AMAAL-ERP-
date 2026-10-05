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
const pnpmWorkspace = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
if (/pnpm/i.test(`${vercel.installCommand} ${vercel.buildCommand}`)) fail('active Vercel commands still reference pnpm');
if (!(vercel.installCommand ?? '').includes('cd apps/web && if [ -f package-lock.json ]; then npm ci')) fail('Vercel install must use the apps/web lockfile when present');
if (!/cd apps\/web && npm run build/.test(vercel.buildCommand)) fail('Vercel build must remain standalone apps/web npm build');
if (!/ignoreCommand/.test(JSON.stringify(vercel))) fail('Vercel vercel.json must define an ignoreCommand to skip ZIP-only/intermediate commits');
if (!/git diff HEAD\^ HEAD --quiet -- apps\/web packages/.test(vercel.ignoreCommand ?? '')) fail('Vercel ignoreCommand must include the web app and shared packages');
if (/pnpm install|pnpm@/i.test(render)) fail('render.yaml contains an active pnpm deployment command');
if (/type d \\n/.test(zipSync) || /-type d .*\\n/.test(zipSync)) fail('zip-sync workflow contains a literal backslash-n inside a shell command');
if (!render.includes('buildCommand: if [ -f package-lock.json ]; then npm ci --ignore-scripts --no-audit --no-fund; else npm install --ignore-scripts --no-audit --no-fund; fi')) fail('Render blueprint must use npm with a lockfile-first install strategy');
if (!/autoDeployTrigger:\s*checksPass/.test(render)) fail('Render services must wait for passing CI checks before automatic deployment');
if (!/buildFilter:\s*\n\s+paths:/.test(render)) fail('Render blueprint must define build filters');
if (!/ignoredPaths:\s*\n\s+- ['\"]\*\*\/\*\.zip['\"]/.test(render)) fail('Render build filters must explicitly ignore uploaded ZIP artifacts');
if (!/allowBuilds:\s*\n\s+core-js:\s+true/.test(pnpmWorkspace)) fail('pnpm fallback configuration must explicitly allow core-js build scripts for pnpm 11+');
for (const workflow of ['ci.yml', 'generate-lockfiles.yml']) {
  if (!existsSync(join(root, '.github/workflows', workflow))) fail(`approved workflow missing: ${workflow}`);
}
if (!/APPROVED_WORKFLOWS/.test(zipSync) || !/ci\.yml/.test(zipSync) || !/generate-lockfiles\.yml/.test(zipSync)) fail('ZIP sync workflow must use the reviewed workflow allow-list');
if (!/git diff --cached --name-only \| grep -Ei '\\.zip\$'/.test(zipSync)) fail('ZIP sync workflow must reject staged ZIP artifacts');

const zipArtifacts = [];
function collectZipFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectZipFiles(path);
    else if (/\.zip$/i.test(entry.name)) zipArtifacts.push(relative(root, path));
  }
}
collectZipFiles(root);
if (zipArtifacts.length) fail(`repository tree must not contain ZIP deployment artifacts: ${zipArtifacts.join(', ')}`);

const resetPage = readFileSync(join(root, 'apps/web/app/reset-password/page.tsx'), 'utf8');
const resetContent = readFileSync(join(root, 'apps/web/app/reset-password/content.tsx'), 'utf8');
if (!/Suspense/.test(resetPage) || !/ResetPasswordContent/.test(resetPage)) fail('reset-password page must place its search-param consumer behind Suspense');
if (!/useSearchParams/.test(resetContent)) fail('reset-password content component is missing useSearchParams');

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
