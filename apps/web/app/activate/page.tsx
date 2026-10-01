'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, getSetupStatus } from '../../lib/api';
import { authClient, clearMfaAssertion } from '../../lib/auth';
import { BrandLogo } from '../../components/brand-logo';

export default function ActivatePage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const session = await authClient.getSession();
        if (!session?.data) { router.replace('/login'); return; }
        const setup = await getSetupStatus();
        if (setup.stage === 'ACTIVATED') { router.replace('/dashboard'); return; }
        setEmail(session.data.user.email ?? '');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to prepare CEO activation.');
      }
    })();
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await apiFetch('/v1/setup/activate-ceo', { method: 'POST', body: JSON.stringify({ activationCode: code.trim() }) });
      clearMfaAssertion();
      router.replace('/mfa');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'CEO activation could not be completed.');
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <BrandLogo variant="full" className="auth-logo" priority />
        <h1>Activate CEO access</h1>
        <p className="muted">Confirm the secure activation code to connect this account to the CEO identity for Amaal.</p>
        <div className="setup-summary auth-summary">
          <div><span>Signed-in account</span><strong>{email || 'Loading…'}</strong></div>
        </div>
        <form onSubmit={submit} className="auth-form">
          <label>
            Amaal activation code
            <input type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          {error ? <p className="error-text" role="alert">{error}</p> : null}
          <button type="submit" disabled={busy}>{busy ? 'Activating…' : 'Activate CEO access'}</button>
        </form>
        <button type="button" className="ghost-button auth-secondary" onClick={() => void authClient.signOut().then(() => router.replace('/login'))}>Use another account</button>
      </section>
    </main>
  );
}
