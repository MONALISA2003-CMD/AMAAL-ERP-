import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/web/app');
const banned = [
  'Neon Auth', 'HTTP 404', 'HTTP 500', 'TypeScript', 'JavaScript', 'SQL', 'serverless',
  'SDK', 'TOTP', 'governance', 'autonomy', 'outbox',
  'foundation mode', 'provider:', 'model:', 'execution guard', 'caching', 'technical'
];

function walk(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(file));
    else if (/\.tsx$/.test(entry.name)) result.push(file);
  }
  return result;
}

function visibleText(source) {
  const chunks = [];
  const stringPattern = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  let match;
  while ((match = stringPattern.exec(source))) {
    const value = match[2]
      .replace(/\\[nrt]/g, ' ')
      .replace(/\$\{[^}]*\}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (value && /[A-Za-z]{3}/.test(value) && !value.startsWith('/') && !value.includes('className')) chunks.push(value);
  }
  const jsxTextPattern = />([^<>{]+)</g;
  while ((match = jsxTextPattern.exec(source))) {
    const value = match[1].replace(/\s+/g, ' ').trim();
    if (value) chunks.push(value);
  }
  return chunks;
}

const problems = [];
for (const file of walk(root)) {
  const text = visibleText(fs.readFileSync(file, 'utf8')).join('\n');
  for (const term of banned) {
    if (text.toLowerCase().includes(term.toLowerCase())) problems.push(`${path.relative(process.cwd(), file)}: ${term}`);
  }
}

if (problems.length) {
  console.error('User-facing language check found technical wording:');
  for (const item of problems) console.error(`- ${item}`);
  process.exit(1);
}
console.log(`User-facing language check passed across ${walk(root).length} application pages.`);
