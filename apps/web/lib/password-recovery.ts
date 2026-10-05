'use client';

import { authClient } from './auth';

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

export async function requestPasswordReset(value: string): Promise<{ method: PasswordResetMethod; email: string }> {
  const email = normalizeEmail(value);

  // Current Neon Auth / Better Auth Email OTP password-reset endpoint.
  const emailOtp = authClient.emailOtp;
  if (!emailOtp?.requestPasswordReset) {
    throw new Error('Email OTP password recovery is not enabled on the current Neon Auth configuration.');
  }

  const result = await emailOtp.requestPasswordReset({ email });

  if ('error' in result && result.error) {
    // Do not disclose whether an address is registered.
    throw new Error('If an account exists for that email, recovery instructions have been sent.');
  }

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

  const emailOtp = authClient.emailOtp;
  if (!emailOtp?.resetPassword) {
    throw new Error('Email OTP password recovery is not enabled on the current Neon Auth configuration.');
  }

  const result = await emailOtp.resetPassword({
    email,
    otp,
    password,
  });

  if ('error' in result && result.error) {
    throw new Error(result.error.message ?? 'Unable to reset the password. The code may be expired or invalid.');
  }
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

  const result = await authClient.resetPassword({
    token: normalizedToken,
    newPassword: password,
  });

  if ('error' in result && result.error) {
    throw new Error(result.error.message ?? 'Unable to reset the password. The link may be expired or invalid.');
  }
}
