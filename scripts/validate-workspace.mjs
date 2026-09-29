import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = process.cwd();
const packageDirs = [];
for (const group of ['apps', 'packages', 'services', 'workers']) {
  const dir = join(root, group);
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifest = join(dir, entry.name, 'package.json');
    try {
      if (statSync(manifest).isFile()) packageDirs.push(join(dir, entry.name));
    } catch {}
  }
}

const manifests = new Map();
for (const dir of packageDirs) {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  manifests.set(manifest.name, { dir, manifest });
}

const builtin = new Set([
  'assert','buffer','child_process','cluster','console','constants','crypto','dgram','diagnostics_channel',
  'dns','domain','events','fs','http','http2','https','module','net','os','path','perf_hooks','process',
  'punycode','querystring','readline','repl','stream','string_decoder','sys','timers','tls','trace_events',
  'tty','url','util','v8','vm','wasi','worker_threads','zlib'
]);

function packageName(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) return null;
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mts|cts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const statSafe = (path) => { try { return statSync(path).isFile(); } catch { return false; } };
const errors = [];

for (const { dir, manifest } of manifests.values()) {
  const declared = new Set();
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const name of Object.keys(manifest[section] ?? {})) declared.add(name);
  }

  for (const file of walk(dir)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      const name = packageName(specifier);
      if (name && !builtin.has(name)) {
        if (name.startsWith('@amaal/') && !manifests.has(name)) {
          errors.push(`${relative(root, dir)}: references unknown workspace package ${name}`);
        } else if (!name.startsWith('@amaal/') && !declared.has(name)) {
          errors.push(`${relative(root, dir)}: imports undeclared dependency ${name} from ${relative(root, file)}`);
        }
      }

      // Next.js uses bundler resolution. Node-native server packages do not.
      if (!specifier.startsWith('.') || manifest.name === '@amaal/web') continue;
      if (!/\.(ts|mts|cts|js|mjs|cjs)$/.test(specifier)) {
        errors.push(`${relative(root, file)}: relative Node-native import must include an explicit extension: ${specifier}`);
        continue;
      }
      const resolved = resolve(dirname(file), specifier);
      if (specifier.endsWith('.ts') || specifier.endsWith('.mts') || specifier.endsWith('.cts')) {
        if (!statSafe(resolved)) errors.push(`${relative(root, file)}: relative TS import target does not exist: ${specifier}`);
      } else if (specifier.endsWith('.js') && !statSafe(resolved)) {
        const tsTarget = resolved.slice(0, -3) + '.ts';
        if (statSafe(tsTarget)) errors.push(`${relative(root, file)}: Node-native TS source should import .ts, not .js: ${specifier}`);
      }
    }
  }

  const exportsField = manifest.exports;
  if (exportsField && typeof exportsField === 'object') {
    const targets = [];
    const collect = (value) => {
      if (typeof value === 'string') targets.push(value);
      else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    collect(exportsField);
    for (const target of targets) {
      if (target.startsWith('./') && !statSafe(join(dir, target))) {
        errors.push(`${relative(root, dir)}: export target does not exist: ${target}`);
      }
    }
  }
}

const testsDir = join(root, 'tests');
if (statSafe(testsDir + '/unit/business-rules/state-machines.test.ts')) {
  for (const file of walk(testsDir)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      if (!/\.(ts|mts|cts|js|mjs|cjs)$/.test(specifier)) {
        errors.push(`${relative(root, file)}: test relative import must include an explicit extension: ${specifier}`);
        continue;
      }
      const resolved = resolve(dirname(file), specifier);
      if (specifier.endsWith('.ts') && !statSafe(resolved)) {
        errors.push(`${relative(root, file)}: test TS import target does not exist: ${specifier}`);
      } else if (specifier.endsWith('.js') && !statSafe(resolved) && statSafe(resolved.slice(0,-3)+'.ts')) {
        errors.push(`${relative(root, file)}: native Node test should import .ts, not .js: ${specifier}`);
      }
    }
  }
}

if (errors.length) {
  console.error('Workspace validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Workspace validation passed for ${manifests.size} workspace packages.`);
