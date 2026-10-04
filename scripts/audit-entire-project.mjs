import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const ignore = new Set(['.git','node_modules','.next']);
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignore.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full); else files.push(full);
  }
}
walk(root);
const rel = (p) => path.relative(root, p).replaceAll(path.sep, '/');
const text = (p) => fs.readFileSync(p, 'utf8');
const failures = [];
const warnings = [];

const packageFiles = files.filter((p) => path.basename(p) === 'package.json');
for (const file of packageFiles) {
  try { JSON.parse(text(file)); } catch (error) { failures.push(`invalid package.json: ${rel(file)} (${error.message})`); }
}

const migrations = files.filter((p) => p.includes('/database/migrations/') && p.endsWith('.sql')).map(rel).sort();
const migrationKeys = migrations.map((p) => path.basename(p).match(/^(\d+_\d+)/)?.[1]).filter(Boolean);
const duplicateMigrationNames = migrationKeys.filter((x, i, a) => a.indexOf(x) !== i);
if (duplicateMigrationNames.length) warnings.push(`duplicate migration numeric keys: ${[...new Set(duplicateMigrationNames)].join(', ')}`);

for (const file of files.filter((p) => /\.(ts|tsx|js|mjs|cjs|sql)$/.test(p))) {
  const source = text(file);
  const r = rel(file);
  if (/\b(drop\s+(?:table|schema)|truncate(?:\s+table)?|delete\s+from)\s+(?:public\.)?products\b/i.test(source)) failures.push(`destructive products operation: ${r}`);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)) failures.push(`private key material: ${r}`);
  if (/(?:^|[^A-Za-z])sk-[A-Za-z0-9]{20,}/.test(source)) failures.push(`probable API secret: ${r}`);
  if (/AKIA[0-9A-Z]{16}/.test(source)) failures.push(`probable AWS access key: ${r}`);
}


// Resolve relative code imports conservatively. Aliased workspace imports are intentionally
// excluded because their correctness is governed by the monorepo workspace resolver.
const relativeImportFailures = [];
function candidatePaths(basePath) {
  const ext = path.extname(basePath);
  const candidates = [];
  if (ext) candidates.push(basePath);
  else for (const suffix of ['.ts','.tsx','.js','.mjs','.cjs','.json']) candidates.push(basePath + suffix);
  if (!ext) for (const suffix of ['.ts','.tsx','.js','.mjs','.cjs']) candidates.push(path.join(basePath, 'index' + suffix));
  return candidates;
}
for (const file of files.filter((p) => /\.(ts|tsx|js|mjs|cjs)$/.test(p))) {
  const source = text(file);
  const r = rel(file);
  const importRe = /(?:from\s*|import\s*\()(['"])(\.\.?\/[^'"]+)\1/g;
  for (const match of source.matchAll(importRe)) {
    const specifier = match[2];
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const resolvedBase = path.resolve(path.dirname(file), specifier);
      if (!candidatePaths(resolvedBase).some((candidate) => fs.existsSync(candidate))) {
        const clean = specifier.split('?')[0];
        if (!/\.(css|scss|sass|less|svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/i.test(clean)) {
          relativeImportFailures.push(`${r}: unresolved relative import ${specifier}`);
        }
      }
    }
  }
}
if (relativeImportFailures.length) failures.push(...relativeImportFailures);

const futureSchemaRefs = [];
for (const file of files.filter((p) => /\.(ts|tsx|js|mjs|sql)$/.test(p))) {
  const r = rel(file);
  const source = text(file);
  if (!r.startsWith('database/migrations/') && !r.startsWith('docs/') && !r.startsWith('supabase/') && !r.startsWith('scripts/') && /sale_datetime/.test(source)) futureSchemaRefs.push(`${r}: sale_datetime`);
  if (!r.startsWith('database/migrations/') && !r.startsWith('docs/') && !r.startsWith('scripts/') && /owner_user_id/.test(source)) futureSchemaRefs.push(`${r}: owner_user_id`);
  if (!r.startsWith('database/migrations/') && !r.startsWith('docs/') && !r.startsWith('scripts/') && /final_price/.test(source)) futureSchemaRefs.push(`${r}: final_price`);
}
if (futureSchemaRefs.length) warnings.push(`future Phase 4 schema references remain in runtime code: ${futureSchemaRefs.length} file(s); these are expected to become live only after migrations 000026+ are deployed.`);

const tsSyntaxFiles = files.filter((p) => p.endsWith('.ts')).filter((p) => !p.includes('node_modules'));
for (const file of tsSyntaxFiles) {
  try { execFileSync(process.execPath, ['--experimental-transform-types', '--check', file], { stdio: 'ignore' }); }
  catch { failures.push(`TypeScript syntax check failed: ${rel(file)}`); }
}


const readme = files.find((p) => rel(p) === 'README.md');
const workPhases = files.find((p) => rel(p) === 'docs/AMAAL_WORK_PHASES.md');
if (readme && /Current delivery gate — Phase 1/i.test(text(readme))) warnings.push('README.md current delivery gate is stale relative to the local Stage 7 implementation.');
if (workPhases && /Phase currently active:\*\* Phase [0-6]/i.test(text(workPhases))) warnings.push('docs/AMAAL_WORK_PHASES.md active phase is stale relative to the local Stage 7 implementation.');

console.log(JSON.stringify({
  totalFiles: files.length,
  sourceFiles: files.filter((p) => /\.(ts|tsx|js|mjs|cjs|sql|json)$/.test(p)).length,
  docs: files.filter((p) => p.endsWith('.md')).length,
  migrations: migrations.length,
  packageJson: packageFiles.length,
  failures,
  warnings,
  futureSchemaRefs,
}, null, 2));
if (failures.length) process.exit(1);
