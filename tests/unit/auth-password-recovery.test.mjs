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
