import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const run = (cmd,args,env={}) => {
  const result = spawnSync(cmd,args,{stdio:'inherit',env:{...process.env,...env}});
  return result.status ?? 1;
};
function collect(dir, suffix) {
  const files=[];
  for (const entry of readdirSync(dir,{withFileTypes:true})) {
    const full=join(dir,entry.name);
    if (entry.isDirectory()) files.push(...collect(full,suffix));
    else if (entry.isFile() && entry.name.endsWith(suffix)) files.push(full);
  }
  return files;
}
const tsFiles=collect(join(root,'tests'),'.test.ts').sort();
const jsFiles=collect(join(root,'tests'),'.test.mjs').sort();
const workspaceReady=await import('node:fs').then(({existsSync})=>existsSync(join(root,'node_modules/@amaal/auth/package.json')));
if (workspaceReady) {
  if (run(process.execPath,['--experimental-transform-types','--test',...tsFiles])!==0) process.exit(1);
} else {
  console.warn('TypeScript workspace tests skipped locally because node_modules is absent. CI release gate installs with --frozen-lockfile and runs the complete suite.');
}
if (run(process.execPath,['--experimental-strip-types','--test',...jsFiles])!==0) process.exit(1);
if (process.argv.includes('--all')) {
  const ml=run('python3',['-m','pytest','services/intelligence/tests','-q'],{PYTHONPATH:'services/intelligence'});
  if (ml!==0) process.exit(ml);
  if (run(process.execPath,['--experimental-strip-types','scripts/run-phase8-evals.mjs'])!==0) process.exit(1);
}
console.log('Master test gate: PASS');
