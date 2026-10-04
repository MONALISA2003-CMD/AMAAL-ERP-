import { execFileSync } from 'node:child_process';
const commands = [
  ['node',['scripts/validate-repository.mjs']],
  ['node',['scripts/validate-phase0-2b.mjs']],
  ['node',['scripts/validate-phase3.mjs']],
  ['node',['scripts/validate-phase4.mjs']],
  ['node',['scripts/validate-phase5.mjs']],
  ['node',['scripts/validate-phase6.mjs']],
  ['node',['scripts/validate-phase7.mjs']],
  ['node',['scripts/validate-phase8.mjs']],
  ['node',['scripts/validate-phase9.mjs']],
  ['node',['scripts/validate-release.mjs']],
];
for (const [cmd,args] of commands) execFileSync(cmd,args,{stdio:'inherit'});
execFileSync('node',['scripts/audit-entire-project.mjs'],{stdio:'inherit'});
console.log('Full Stage 1-9 audit gate: PASS');
