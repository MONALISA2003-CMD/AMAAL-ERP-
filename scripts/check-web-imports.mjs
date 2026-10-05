import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/web/app');
const apiSource = fs.readFileSync(path.resolve('apps/web/lib/api.ts'), 'utf8');
const exports = new Set([
  ...apiSource.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g),
].map((m) => m[1]));

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) result.push(full);
  }
  return result;
}

const failures = [];
for (const file of walk(root)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let importBlock = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (importBlock === null && /^import\s+\{/.test(trimmed)) {
      importBlock = trimmed;
    } else if (importBlock !== null) {
      importBlock += `\n${trimmed}`;
    }

    if (importBlock !== null) {
      const fromMatch = importBlock.match(/\}\s*from\s*['"]([^'"]+)['"]/);
      if (fromMatch) {
        if (fromMatch[1] === '../../lib/api') {
          const names = importBlock.match(/^import\s*\{([\s\S]*?)\}\s*from/);
          if (names) {
            for (const item of names[1].split(',').map((x) => x.trim()).filter(Boolean)) {
              if (/^type\s+/.test(item)) continue;
              const name = item.split(/\s+as\s+/)[0].trim();
              if (name && !exports.has(name)) failures.push(`${path.relative(process.cwd(), file)} imports missing API export ${name}`);
            }
          }
        }
        importBlock = null;
      }
    }
  }
}

if (failures.length) {
  console.error('Web import/export check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Web import/export check passed across ${walk(root).length} source files.`);
