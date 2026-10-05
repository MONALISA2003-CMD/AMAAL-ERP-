'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BrandLogo } from '../../components/brand-logo';
import { resetPasswordWithToken } from '../../lib/password-recovery';

export default function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const nextToken = searchParams.get('token') ?? '';
    setToken(nextToken);
    if (!nextToken) setError('This recovery link is missing or invalid. Start a new recovery request.');
  }, [searchParams]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await resetPasswordWithToken(token, password, confirmation);
      setPassword('');
      setConfirmation('');
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to reset the password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <BrandLogo variant="full" className="auth-logo" priority />
        <h1>Choose a new password</h1>
        {done ? (
          <div className="auth-form">
            <p className="microcopy" role="status">Your password has been reset successfully. Your Amaal role and organizational access remain unchanged.</p>
            <button type="button" onClick={() => router.replace('/login')}>Continue to login</button>
          </div>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <label>New password<input autoComplete="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} /></label>
            <label>Confirm new password<input autoComplete="new-password" type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required minLength={10} /></label>
            {error ? <p className="error-text" role="alert">{error}</p> : null}
            <button type="submit" disabled={busy || !token}>{busy ? 'Resetting securely…' : 'Set new password'}</button>
            <button type="button" className="setup-secondary" disabled={busy} onClick={() => router.replace('/forgot-password')}>Start a new recovery</button>
          </form>
        )}
      </section>
    </main>
  );
}
