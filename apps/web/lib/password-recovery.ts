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

  // Current email-code password recovery method.
  const emailOtp = authClient.emailOtp;
  if (!emailOtp?.requestPasswordReset) {
    throw new Error('We couldn’t send a recovery code right now. Please try again in a moment.');
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
    throw new Error('We couldn’t complete the password reset right now. Please try again in a moment.');
  }

  const result = await emailOtp.resetPassword({
    email,
    otp,
    password,
  });

  if ('error' in result && result.error) {
    throw new Error('The code could not be accepted. It may have expired. Request a new code and try again.');
  }
}

export async function resetPasswordWithToken(
  token: string,
  password: string,
  confirmation: string,
): Promise<void> {
  const normalizedToken = token.trim();

  if (!normalizedToken) {
    throw new Error('This password reset link is missing required information. Please request a new link.');
  }

  validateNewPassword(password, confirmation);

  const result = await authClient.resetPassword({
    token: normalizedToken,
    newPassword: password,
  });

  if ('error' in result && result.error) {
    throw new Error('This password reset link is no longer valid. Request a new one and try again.');
  }
}
