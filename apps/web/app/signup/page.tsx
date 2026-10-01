'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '../../lib/auth';
import { getSetupStatus } from '../../lib/api';
import { BrandLogo } from '../../components/brand-logo';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const setup = await getSetupStatus();
        if (setup.stage === 'ACTIVATED') { router.replace('/login'); return; }
        if (setup.pendingCeo) setEmail(setup.pendingCeo.email);
      } catch {
        setError('Amaal could not load its access setup. Please try again.');
      }
    })();
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      if (result.error) throw new Error(result.error.message || 'Account creation failed.');
      const session = await authClient.getSession();
      router.replace(session?.data ? '/activate' : '/login');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Account creation failed.');
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <BrandLogo variant="full" className="auth-logo" priority />
        <h1>Create secure CEO access</h1>
        <p className="muted">Create the account that will be connected to the CEO identity defined during Amaal setup.</p>
        <form onSubmit={submit} className="auth-form">
          <label>
            Full name
            <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </label>
          <label>
            Work email
            <input autoComplete="username" inputMode="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input autoComplete="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} />
          </label>
          {error ? <p className="error-text" role="alert">{error}</p> : null}
          <button type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create secure account'}</button>
        </form>
        <p className="microcopy">Only the CEO email selected during organization setup can be connected to the first Amaal executive account.</p>
        <button type="button" className="ghost-button auth-secondary" onClick={() => router.replace('/login')}>I already have an account</button>
      </section>
    </main>
  );
}
