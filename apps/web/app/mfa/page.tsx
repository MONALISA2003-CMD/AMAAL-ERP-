'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import { isPrivilegedRole } from '../../lib/privileged';
import { getSupabaseBrowserClient } from '../../lib/supabase';
import { BrandLogo } from '../../components/brand-logo';

type Me = {
  authorization: { roles: string[] };
  authenticatorAssuranceLevel: 'aal1' | 'aal2';
  mfaRequired: boolean;
};

export default function MfaPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'loading'|'enroll'|'challenge'|'done'>('loading');
  const [factorId, setFactorId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const me = await apiFetch<Me>('/v1/me');
        if (!isPrivilegedRole(me.authorization.roles)) { router.replace('/dashboard'); return; }
        if (me.authenticatorAssuranceLevel === 'aal2') { router.replace('/dashboard'); return; }
        const supabase = await getSupabaseBrowserClient();
        const factors = await supabase.auth.mfa.listFactors();
        if (factors.error) throw factors.error;
        const verifiedTotp = factors.data.totp.find((factor) => factor.status === 'verified');
        if (verifiedTotp) {
          if (active) { setFactorId(verifiedTotp.id); setMode('challenge'); }
        } else {
          if (active) setMode('enroll');
        }
      } catch (e) {
        if (active) { setError(e instanceof Error ? e.message : 'Unable to prepare MFA.'); setMode('enroll'); }
      }
    })();
    return () => { active = false; };
  }, [router]);

  async function enroll() {
    setBusy(true); setError('');
    try {
      const supabase = await getSupabaseBrowserClient();
      const result = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (result.error) throw result.error;
      setFactorId(result.data.id);
      setQrCode(result.data.totp.qr_code);
      setMode('challenge');
    } catch (e) { setError(e instanceof Error ? e.message : 'MFA enrollment failed.'); }
    finally { setBusy(false); }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const supabase = await getSupabaseBrowserClient();
      let activeChallengeId = challengeId;
      if (!activeChallengeId) {
        const challenge = await supabase.auth.mfa.challenge({ factorId });
        if (challenge.error) throw challenge.error;
        activeChallengeId = challenge.data.id;
        setChallengeId(activeChallengeId);
      }
      const result = await supabase.auth.mfa.verify({ factorId, challengeId: activeChallengeId, code: code.trim() });
      if (result.error) throw result.error;
      setMode('done');
      router.replace('/dashboard');
    } catch (e) { setError(e instanceof Error ? e.message : 'MFA verification failed.'); }
    finally { setBusy(false); }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="eyebrow">SECURE ACCESS</div>
        <BrandLogo variant="full" className="auth-logo" priority />
        <h1>Multi-factor verification</h1>
        <p className="muted">Add a second sign-in step to keep your Amaal account protected.</p>
        {mode === 'enroll' ? (
          <div className="mfa-stack">
            <p>Set up an authenticator app using Amaal’s TOTP enrollment.</p>
            <button type="button" onClick={enroll} disabled={busy}>{busy ? 'Preparing…' : 'Set up authenticator'}</button>
          </div>
        ) : null}
        {qrCode ? <div className="qr-box"><Image src={`data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`} alt="Amaal TOTP enrollment QR code" width={190} height={190} unoptimized /></div> : null}
        {mode === 'challenge' ? (
          <form onSubmit={verify} className="auth-form">
            <label>
              Authenticator code
              <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required minLength={6} maxLength={8} />
            </label>
            {error ? <p className="error-text" role="alert">{error}</p> : null}
            <button type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
          </form>
        ) : null}
        {mode === 'done' ? <p className="muted">Verification complete.</p> : null}
        {error && mode === 'enroll' ? <p className="error-text" role="alert">{error}</p> : null}
        <p className="microcopy">Your security settings protect privileged Amaal access.</p>
      </section>
    </main>
  );
}
