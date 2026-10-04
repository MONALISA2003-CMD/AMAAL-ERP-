'use client';

import { authClient } from './auth';

type AuthResult = {
  data?: unknown;
  error?: { message?: string; code?: string } | null;
};

const client = authClient as unknown as {
  forgetPassword?: {
    emailOtp?: (input: { email: string }) => Promise<AuthResult>;
  } | ((input: { email: string; redirectTo: string }) => Promise<AuthResult>);
  emailOtp?: {
    resetPassword?: (input: { email: string; otp: string; password: string }) => Promise<AuthResult>;
  };
  resetPassword?: (input: { newPassword: string; token: string }) => Promise<AuthResult>;
};

export type PasswordResetMethod = 'OTP' | 'LINK';

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid work email address.');
  return email;
}

export function validateNewPassword(password: string, confirmation: string): void {
  if (password.length < 10) throw new Error('Your new password must be at least 10 characters.');
  if (password.length > 128) throw new Error('Your new password is too long.');
  if (password !== confirmation) throw new Error('The new passwords do not match.');
}

function throwAuthError(result: AuthResult, fallback: string): void {
  if (result.error) throw new Error(result.error.message || fallback);
}

function throwGenericRequestError(result: AuthResult, fallback: string): void {
  // Avoid revealing whether an email address is registered with the identity provider.
  if (result.error) throw new Error(fallback);
}

export async function requestPasswordReset(value: string): Promise<{ method: PasswordResetMethod; email: string }> {
  const email = normalizeEmail(value);
  const otpSender = typeof client.forgetPassword === 'object' ? client.forgetPassword?.emailOtp : undefined;
  if (otpSender) {
    const result = await otpSender({ email });
    throwGenericRequestError(result, 'If an account exists for that email, recovery instructions have been sent.');
    return { method: 'OTP', email };
  }

  if (typeof client.forgetPassword === 'function') {
    const redirectTo = `${window.location.origin}/reset-password`;
    const result = await client.forgetPassword({ email, redirectTo });
    throwGenericRequestError(result, 'If an account exists for that email, recovery instructions have been sent.');
    return { method: 'LINK', email };
  }

  throw new Error('Password recovery is not enabled on the current Neon Auth configuration.');
}

export async function resetPasswordWithOtp(emailValue: string, otpValue: string, password: string, confirmation: string): Promise<void> {
  const email = normalizeEmail(emailValue);
  const otp = otpValue.trim();
  if (!/^\d{6}$/.test(otp)) throw new Error('Enter the 6-digit reset code from your email.');
  validateNewPassword(password, confirmation);
  const resetter = client.emailOtp?.resetPassword;
  if (!resetter) throw new Error('OTP password recovery is not enabled on the current Neon Auth configuration.');
  const result = await resetter({ email, otp, password });
  throwAuthError(result, 'Unable to reset the password. The code may be expired or invalid.');
}

export async function resetPasswordWithToken(token: string, password: string, confirmation: string): Promise<void> {
  const normalizedToken = token.trim();
  if (!normalizedToken) throw new Error('The password reset link is missing its token.');
  validateNewPassword(password, confirmation);
  if (!client.resetPassword) throw new Error('Link-based password recovery is not enabled on the current Neon Auth configuration.');
  const result = await client.resetPassword({ token: normalizedToken, newPassword: password });
  throwAuthError(result, 'Unable to reset the password. The link may be expired or invalid.');
}
