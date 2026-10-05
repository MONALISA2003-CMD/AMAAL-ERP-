import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');

const required = [
  'apps/web/package.json',
  'apps/web/vercel.json',
  'apps/web/next.config.ts',
  'apps/web/app/password-reset/page.tsx',
  'apps/web/lib/password-recovery.ts',
  '.github/workflows/ci.yml',
];

const forbidden = [
  'vercel.json',
  'scripts/vercel-ignore-build.sh',
  '.github/workflows/zip-sync.yml',
];

const missing = required.filter((file) => !existsSync(resolve(repoRoot, file)));
const presentForbidden = forbidden.filter((file) => existsSync(resolve(repoRoot, file)));
const recoveryPath = resolve(repoRoot, 'apps/web/lib/password-recovery.ts');
const recoverySource = existsSync(recoveryPath) ? readFileSync(recoveryPath, 'utf8') : '';
const recoveryViolations = [];

if (/forgetPassword/.test(recoverySource)) {
  recoveryViolations.push('legacy forgetPassword API reference detected');
}
if (!/emailOtp\??\.requestPasswordReset/.test(recoverySource)) {
  recoveryViolations.push('current Email OTP requestPasswordReset API is missing');
}
if (!/emailOtp\??\.resetPassword/.test(recoverySource)) {
  recoveryViolations.push('current Email OTP resetPassword API is missing');
}
if (/type\s+AuthResult/.test(recoverySource)) {
  recoveryViolations.push('custom AuthResult type detected; use native SDK result narrowing');
}

if (missing.length || presentForbidden.length || recoveryViolations.length) {
  if (missing.length) {
    console.error('Missing required deployment-architecture files:');
    for (const file of missing) console.error(`  - ${file}`);
  }
  if (presentForbidden.length) {
    console.error('Forbidden legacy deployment-architecture files detected:');
    for (const file of presentForbidden) console.error(`  - ${file}`);
  }
  if (recoveryViolations.length) {
    console.error('Password-recovery architecture violations detected:');
    for (const violation of recoveryViolations) console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log('Deployment architecture contract: PASS');
console.log('Vercel source of truth: apps/web');
console.log('Password recovery: current Neon Auth Email OTP API');
console.log('GitHub main must remain source-only; no ZIP rewrite workflow is permitted.');
