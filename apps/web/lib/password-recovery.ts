'use client';

import { authClient } from './auth';

type AuthResult = {
  data?: unknown;
  error?: { message?: string; code?: string } | null;
};

export type PasswordResetMethod = 'OTP' | 'LINK';

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid work email address.');
  }
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

function throwGenericRequestError(result: AuthResult): void {
  // Keep recovery account-enumeration resistant.
  if (result.error) {
    throw new Error('If an account exists for that email, recovery instructions have been sent.');
  }
}

export async function requestPasswordReset(value: string): Promise<{ method: PasswordResetMethod; email: string }> {
  const email = normalizeEmail(value);

  // Current Neon Auth / Better Auth Email OTP password-reset endpoint.
  // The legacy password-recovery endpoint must never be used here.
  const requestPasswordReset = authClient.emailOtp?.requestPasswordReset;
  if (!requestPasswordReset) {
    throw new Error('Email OTP password recovery is not enabled on the current Neon Auth configuration.');
  }

  const result = await requestPasswordReset({ email });
  throwGenericRequestError(result);

  return { method: 'OTP', email };
}

export async function resetPasswordWithOtp(
  emailValue: string,
  otpValue: string,
  password: string,
  confirmation: string,
): Promise<void> {
  const email = normalizeEmail(emailValue);
  const otp = otpValue.trim();

  if (!/^\d{6}$/.test(otp)) {
    throw new Error('Enter the 6-digit reset code from your email.');
  }

  validateNewPassword(password, confirmation);

  const resetPassword = authClient.emailOtp?.resetPassword;
  if (!resetPassword) {
    throw new Error('Email OTP password recovery is not enabled on the current Neon Auth configuration.');
  }

  const result = await resetPassword({
    email,
    otp,
    password,
  });

  throwAuthError(result, 'Unable to reset the password. The code may be expired or invalid.');
}

export async function resetPasswordWithToken(
  token: string,
  password: string,
  confirmation: string,
): Promise<void> {
  const normalizedToken = token.trim();

  if (!normalizedToken) {
    throw new Error('The password reset link is missing its token.');
  }

  validateNewPassword(password, confirmation);

  const resetPassword = authClient.resetPassword;
  if (!resetPassword) {
    throw new Error('Link-based password recovery is not enabled on the current Neon Auth configuration.');
  }

  const result = await resetPassword({
    token: normalizedToken,
    newPassword: password,
  });

  throwAuthError(result, 'Unable to reset the password. The link may be expired or invalid.');
}
