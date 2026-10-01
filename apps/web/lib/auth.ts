'use client';

import { createAuthClient } from '@neondatabase/auth/next';

export const authClient = createAuthClient();

export function getMfaAssertion(): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem('amaal.mfa.assertion');
}

export function setMfaAssertion(assertion: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem('amaal.mfa.assertion', assertion);
}

export function clearMfaAssertion(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem('amaal.mfa.assertion');
}
