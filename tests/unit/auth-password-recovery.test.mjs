import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const helper = readFileSync('apps/web/lib/password-recovery.ts', 'utf8');
const forgot = readFileSync('apps/web/app/forgot-password/page.tsx', 'utf8');
const reset = readFileSync('apps/web/app/reset-password/content.tsx', 'utf8');
const passwordReset = readFileSync('apps/web/app/password-reset/page.tsx', 'utf8');
const login = readFileSync('apps/web/app/login/page.tsx', 'utf8');

test('login exposes the canonical password recovery route', () => {
  assert.match(login, /href="\/forgot-password"/);
});

test('recovery uses the current Neon Auth Email OTP API', () => {
  assert.match(helper, /emailOtp\?\.requestPasswordReset/);
  assert.match(helper, /emailOtp\?\.resetPassword/);
  assert.doesNotMatch(helper, /forgetPassword/);
  assert.doesNotMatch(helper, /fetch\s*\(/);
  assert.doesNotMatch(helper, /\b(password_hash|update\s+.*password|insert\s+.*password)/i);
});

test('recovery uses native SDK result narrowing without a fake AuthResult type', () => {
  assert.doesNotMatch(helper, /type\s+AuthResult/);
  assert.match(helper, /'error'\s+in\s+result/);
});

test('new password policy is bounded and confirmation-matched', () => {
  assert.match(helper, /password\.length < 10/);
  assert.match(helper, /password\.length > 128/);
  assert.match(helper, /password !== confirmation/);
});

test('request errors are account-enumeration resistant', () => {
  assert.match(helper, /If an account exists for that email, recovery instructions have been sent\./);
});

test('successful OTP recovery clears secrets held in React state', () => {
  assert.match(forgot, /setOtp\(''\)/);
  assert.match(forgot, /setPassword\(''\)/);
  assert.match(forgot, /setConfirmation\(''\)/);
});

test('successful token recovery clears passwords held in React state', () => {
  assert.match(reset, /setPassword\(''\)/);
  assert.match(reset, /setConfirmation\(''\)/);
  assert.match(reset, /searchParams\.get\('error'\)/);
});

test('legacy password-reset URL is a compatibility alias', () => {
  assert.match(passwordReset, /redirect\('\/forgot-password'\)/);
});

test('recovery pages do not expose implementation details', () => {
  assert.doesNotMatch(forgot, /Neon Auth/);
  assert.doesNotMatch(forgot, /HTTP/);
  assert.doesNotMatch(forgot, /API/);
});


test('current Email OTP endpoint contract is explicit', () => {
  assert.match(helper, /requestPasswordReset\(\{ email \}/);
  assert.match(helper, /resetPassword\(\{[\s\S]*email,[\s\S]*otp,[\s\S]*password,/);
  assert.doesNotMatch(helper, /forget-password\/email-otp/);
});

test('password recovery failures stay understandable to employees', () => {
  assert.match(helper, /couldn’t send a recovery code right now/);
  assert.match(forgot, /Check your email for a 6-digit code/);
  assert.match(forgot, /spam or junk folder/);
});


test('finance page uses the existing loan provider API names', () => {
  const finance = readFileSync('apps/web/app/finance/page.tsx', 'utf8');
  assert.match(finance, /createLoanProviderApi/);
  assert.match(finance, /listLoanProvidersApi/);
  assert.doesNotMatch(finance, /createLoanPartnerApi/);
  assert.doesNotMatch(finance, /listLoanPartnersApi/);
});

test('account access check uses business profile data and loaded roles', () => {
  const http = readFileSync('services/api/src/http.ts', 'utf8');
  assert.doesNotMatch(http, /neon_auth\.\"user\"/);
  assert.match(http, /status::text as status/);
  assert.match(http, /roles: readonly string\[\]/);
  assert.doesNotMatch(http, /array_agg\(distinct ra\.role/);
});

test('login maps internal request failures to user-friendly language', () => {
  const login = readFileSync('apps/web/app/login/page.tsx', 'utf8');
  assert.match(login, /We could not finish signing you in right now/);
});


test('sales uses the real product variant field', () => {
  const sales = readFileSync('apps/web/app/sales/page.tsx', 'utf8');
  assert.match(sales, /productVariantId/);
  assert.doesNotMatch(sales, /productProductId/);
});

test('the account access check uses business tables only', () => {
  const http = readFileSync('services/api/src/http.ts', 'utf8');
  assert.doesNotMatch(http, /neon_auth\."user"/);
  assert.match(http, /status::text as status/);
  assert.match(http, /roles: readonly string\[\]/);
});

test('reports keep internal scoring details out of the visible page', () => {
  const reports = readFileSync('apps/web/app/reports/page.tsx', 'utf8');
  assert.doesNotMatch(reports, />HHI</);
  assert.doesNotMatch(reports, /ML Intelligence/);
  assert.match(reports, /Planning insights/);
});

test('AI review rows use business labels instead of internal action names', () => {
  const ai = readFileSync('apps/web/app/ai/page.tsx', 'utf8');
  assert.match(ai, /function actionLabel/);
  assert.match(ai, /Open recovery case/);
  assert.doesNotMatch(ai, /<strong>\{item\.toolName\.replaceAll/);
});


test('sales keeps the product variant field', () => {
  const sales = readFileSync('apps/web/app/sales/page.tsx', 'utf8');
  assert.match(sales, /productVariantId/);
  assert.doesNotMatch(sales, /productProductId/);
});

test('AI approval screens map internal action names to business language', () => {
  const ai = readFileSync('apps/web/app/ai/page.tsx', 'utf8');
  assert.match(ai, /function actionLabel/);
  assert.match(ai, /Open recovery case/);
  assert.doesNotMatch(ai, /item\.toolName\.replaceAll/);
  assert.doesNotMatch(ai, /plan\.toolName\.replaceAll/);
});


test('intelligence page matches the API contract', () => {
  const intelligence = readFileSync('apps/web/app/intelligence/page.tsx', 'utf8');
  assert.match(intelligence, /AmaalIntelligencePrediction/);
  assert.match(intelligence, /latestPredictionAt/);
  assert.match(intelligence, /item\.confidence/);
  assert.doesNotMatch(intelligence, /AmaalIntelligencePlanning/);
  assert.doesNotMatch(intelligence, /latestPlanning/);
});


test('administrator profiles use business labels', () => {
  const display = readFileSync('apps/web/lib/display.ts', 'utf8');
  const organization = readFileSync('apps/web/app/organization/page.tsx', 'utf8');
  assert.match(display, /System administrator/);
  assert.match(organization, /adminProfileLabel/);
  assert.doesNotMatch(organization, /roleLabel\(r\).*SYSTEM_ADMIN/);
});


test('API client converts infrastructure failures to friendly messages', () => {
  const api = readFileSync('apps/web/lib/api.ts', 'utf8');
  assert.match(api, /status >= 500/);
  assert.match(api, /We could not complete that request right now/);
  assert.match(api, /SQL\|API\|SDK/);
});

test('organization screen does not duplicate display imports', () => {
  const organization = readFileSync('apps/web/app/organization/page.tsx', 'utf8');
  assert.equal((organization.match(/lib\/display/g) ?? []).length, 1);
});


test('recovery page has one definition of each local helper', () => {
  const recovery = readFileSync('apps/web/app/recovery/page.tsx', 'utf8');
  for (const name of ['bandClass', 'agingLabel', 'activityLabel']) {
    const count = (recovery.match(new RegExp('\\bfunction\\s+' + name + '\\s*\\(', 'g')) ?? []).length;
    assert.equal(count, 1, `${name} should be defined exactly once`);
  }
});


test('CEO has explicit company-wide authorization by role', () => {
  const authorization = readFileSync('packages/permissions/src/authorization.ts', 'utf8');
  assert.match(authorization, /function isCompanyWideRole/);
  assert.match(authorization, /roles\.includes\('CEO'\)/);
  assert.match(authorization, /Company-wide leadership authority/);
});

test('Vercel web build is not coupled to repository-root checks', () => {
  const webPackage = JSON.parse(readFileSync('apps/web/package.json', 'utf8'));
  assert.equal(webPackage.scripts.prebuild, undefined);
});
