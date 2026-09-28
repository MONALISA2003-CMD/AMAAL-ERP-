import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const packageDirs = [];
for (const group of ['apps', 'packages', 'services', 'workers']) {
  const dir = join(root, group);
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const manifest = join(dir, name.name, 'package.json');
    try {
      const stat = statSync(manifest);
      if (stat.isFile()) packageDirs.push(join(dir, name.name));
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
  'tty','url','util','v8','vm','wasi','worker_threads','zlib',
]);

function packageName(specifier) {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) return null;
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
}

const importPattern = /(?:import|export)\s+(?:type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const errors = [];

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

for (const { dir, manifest } of manifests.values()) {
  const declared = new Set();
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const name of Object.keys(manifest[section] ?? {})) declared.add(name);
  }

  for (const file of walk(dir)) {
    const source = readFileSync(file, 'utf8');
    for (const extensionMatch of source.matchAll(/(?:from\s+|import\s*\(\s*)['\"]([^'\"]+)['\"]/g)) {
      const specifier = extensionMatch[1];
      if (specifier.endsWith('.ts') || specifier.endsWith('.tsx')) {
        errors.push(`${relative(root, dir)}: direct TypeScript extension import is not allowed: ${specifier} from ${relative(root, file)}`);
      }
    }
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1] ?? match[2];
      const name = packageName(specifier);
      if (!name || builtin.has(name)) continue;
      if (name.startsWith('@amaal/') && !manifests.has(name)) {
        errors.push(`${relative(root, dir)}: references unknown workspace package ${name}`);
      } else if (!declared.has(name)) {
        errors.push(`${relative(root, dir)}: imports undeclared dependency ${name} from ${relative(root, file)}`);
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
      if (target.startsWith('./') && !requireExists(join(dir, target))) {
        errors.push(`${relative(root, dir)}: export target does not exist: ${target}`);
      }
    }
  }
}

function requireExists(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}

if (errors.length) {
  console.error('Workspace validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Workspace validation passed for ${manifests.size} workspace packages.`);
