import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let ts;
try {
  ts = require('typescript');
} catch {
  try {
    const tsc = execFileSync('sh', ['-lc', 'command -v tsc'], { encoding: 'utf8' }).trim();
    const candidate = path.resolve(path.dirname(tsc), '../lib/node_modules/typescript/lib/typescript.js');
    ts = require(candidate);
  } catch {
    console.warn('TypeScript syntax check skipped: TypeScript is not installed in this environment. CI installs repository dependencies before running this check.');
    process.exit(0);
  }
}

const roots = ['apps', 'services', 'packages'].filter((dir) => fs.existsSync(dir));
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
  }
}
for (const root of roots) walk(root);
const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  if (sf.parseDiagnostics?.length) failures.push({ file, messages: sf.parseDiagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')) });
}
console.log(`Parsed ${files.length} TypeScript/TSX files.`);
if (failures.length) { console.error('TypeScript syntax errors found:'); for (const failure of failures) console.error(`- ${failure.file}: ${failure.messages.join(' | ')}`); process.exit(1); }
console.log('TypeScript syntax check: PASS');
