'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const supabase = await getSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        if (data.session) router.replace('/dashboard');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to load authentication.');
      }
    })();
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const supabase = await getSupabaseBrowserClient();
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (result.error) {
      setError('Authentication failed. Verify your credentials and account status.');
      setBusy(false);
      return;
    }
    router.replace('/dashboard');
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="eyebrow">INTERNAL OPERATIONS PLATFORM</div>
        <div className="brand-mark">AMAAL</div>
        <h1>Secure ERP access</h1>
        <p className="muted">Amaal is a closed company system. All operational activity is authenticated and authorized.</p>
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
          <button type="submit" disabled={busy}>{busy ? 'Authenticating…' : 'Sign in securely'}</button>
        </form>
        <p className="microcopy">Core business permissions are re-checked by the Amaal API. The browser is never the authority.</p>
      </section>
    </main>
  );
}
