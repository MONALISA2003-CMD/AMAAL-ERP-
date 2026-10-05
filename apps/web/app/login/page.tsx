'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '../../lib/auth';
import { apiFetch, getSetupStatus } from '../../lib/api';
import { BrandLogo } from '../../components/brand-logo';
import { isPrivilegedRole } from '../../lib/privileged';
import { clearMfaAssertion } from '../../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const setup = await getSetupStatus();
        const session = await authClient.getSession();
        if (setup.stage === 'ORGANIZATION_READY') {
          router.replace(session?.data ? '/activate' : '/setup');
          return;
        }
        if (setup.stage !== 'ACTIVATED') {
          router.replace('/setup');
          return;
        }
        if (session?.data) router.replace('/dashboard');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to continue.');
      }
    })();
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    clearMfaAssertion();
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) throw new Error(result.error.message || 'Authentication failed.');
      const setup = await getSetupStatus();
      if (setup.stage === 'ORGANIZATION_READY') {
        router.replace('/activate');
        return;
      }
      const identity = await apiFetch<{ authorization: { roles: string[] }; mfaRequired: boolean; mfaVerified: boolean }>('/v1/me');
      if (identity.mfaRequired || isPrivilegedRole(identity.authorization.roles) && !identity.mfaVerified) {
        router.replace('/mfa');
      } else {
        router.replace('/dashboard');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      const friendly = /request could not be completed|could not complete that request|internal server error|invalid or expired access token|authentication required/i.test(message)
        ? 'We could not finish signing you in right now. Please try again.'
        : message || 'We could not sign you in. Please check your details and try again.';
      setError(friendly);
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <BrandLogo variant="full" className="auth-logo" priority />
        <h1>Sign in to Amaal</h1>
        <p className="muted">Welcome back. Enter your details to continue.</p>
        <form onSubmit={submit} className="auth-form">
          <label>
            Work email
            <input autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input autoComplete="current-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error ? <p className="error-text" role="alert">{error}</p> : null}
          <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="microcopy"><a href="/forgot-password">Forgot your password?</a></p>
        </form>
        <p className="microcopy">Your access is protected by Amaal security controls.</p>
      </section>
    </main>
  );
}
