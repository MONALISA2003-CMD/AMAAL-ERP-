'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '../../lib/auth';
import { acceptOrganizationInvitation, getOrganizationInvitationPreview, getSetupStatus } from '../../lib/api';
import { BrandLogo } from '../../components/brand-logo';
import { roleLabel } from '../../lib/display';

export default function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite')?.trim() || '';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviteRole, setInviteRole] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const setup = await getSetupStatus();
        if (inviteToken) {
          const preview = await getOrganizationInvitationPreview(inviteToken);
          setEmail(preview.email);
          setName(preview.displayName);
          setInviteRole(roleLabel(preview.role));
          return;
        }
        if (setup.stage === 'ACTIVATED') { router.replace('/login'); return; }
        if (setup.pendingCeo) setEmail(setup.pendingCeo.email);
      } catch {
        setError('This Amaal invitation is invalid or no longer available.');
      }
    })();
  }, [inviteToken, router]);

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
      if (session?.data && inviteToken) {
        await acceptOrganizationInvitation(inviteToken);
        router.replace('/login?onboarding=complete');
        return;
      }
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
        <h1>{inviteToken ? 'Join Amaal' : 'Create secure CEO access'}</h1>
        <p className="muted">{inviteToken ? `This invitation gives you ${inviteRole || 'Amaal'} access for your company.` : 'Create the CEO sign-in for the company.'}</p>
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
        <p className="microcopy">{inviteToken ? 'Use the email address that received the invitation. Your Amaal access will be ready after the invitation is accepted.' : 'Only the CEO email chosen during company setup can be used for the first executive sign-in.'}</p>
        <button type="button" className="ghost-button auth-secondary" onClick={() => router.replace('/login')}>I already have an account</button>
      </section>
    </main>
  );
}
