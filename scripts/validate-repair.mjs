import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'apps/web/app/forgot-password/page.tsx',
  'apps/web/app/reset-password/page.tsx',
  'apps/web/app/password-reset/page.tsx',
  'apps/web/lib/password-recovery.ts',
  'apps/web/lib/api.ts',
  'apps/web/app/finance/page.tsx',
  'apps/web/app/sales/page.tsx',
  'apps/web/app/intelligence/page.tsx',
  'services/api/src/http.ts',
  'scripts/check-user-language.mjs',
  'scripts/check-web-imports.mjs',
  'scripts/check-typescript-syntax.mjs',
];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) { console.error(missing.map((x) => `Missing: ${x}`).join('\n')); process.exit(1); }
function read(file){ return fs.readFileSync(path.join(root,file),'utf8'); }
const finance=read('apps/web/app/finance/page.tsx');
const sales=read('apps/web/app/sales/page.tsx');
const http=read('services/api/src/http.ts');
const recovery=read('apps/web/lib/password-recovery.ts');
const checks = [
  ['current recovery request', /emailOtp\.requestPasswordReset\(\{ email \}/.test(recovery)],
  ['current recovery reset', /emailOtp\.resetPassword\([\s\S]*email,[\s\S]*otp,[\s\S]*password/.test(recovery)],
  ['legacy recovery removed', !/forgetPassword/.test(recovery)],
  ['finance API names aligned', /createLoanProviderApi/.test(finance) && /listLoanProvidersApi/.test(finance) && !/LoanPartnerApi|LoanPartnersApi/.test(finance)],
  ['sales product field aligned', /productVariantId/.test(sales) && !/productProductId/.test(sales)],
  ['account check avoids managed auth table', !/neon_auth\."user"/.test(http) && /status::text as status/.test(http) && /roles: readonly string\[\]/.test(http)],
];
const failures=checks.filter(([,ok])=>!ok).map(([name])=>name);
if(failures.length){ console.error('Repair validation failed:\n- '+failures.join('\n- ')); process.exit(1); }
console.log('Amaal repair validation passed.');
