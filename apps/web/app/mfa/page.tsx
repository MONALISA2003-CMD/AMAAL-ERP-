'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { apiFetch } from '../../lib/api';
import { isPrivilegedRole } from '../../lib/privileged';
import { authClient, clearMfaAssertion, setMfaAssertion } from '../../lib/auth';
import { BrandLogo } from '../../components/brand-logo';

type MfaStatus = {
  required: boolean;
  enrolled: boolean;
  pending: boolean;
  verified: boolean;
};

type Me = {
  authorization: { roles: string[] };
  mfaRequired: boolean;
  mfaVerified: boolean;
};

export default function MfaPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'loading'|'enroll'|'challenge'>('loading');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const me = await apiFetch<Me>('/v1/me');
        if (!isPrivilegedRole(me.authorization.roles)) { router.replace('/dashboard'); return; }
        if (!me.mfaRequired || me.mfaVerified) { router.replace('/dashboard'); return; }

        const status = await apiFetch<MfaStatus>('/v1/mfa/status');
        if (!active) return;
        if (status.verified) { router.replace('/dashboard'); return; }
        setMode(status.enrolled ? 'challenge' : 'enroll');
      } catch (e) {
        if (active) {
          clearMfaAssertion();
          setError(e instanceof Error ? e.message : 'Unable to prepare secure verification.');
          setMode('enroll');
        }
      }
    })();
    return () => { active = false; };
  }, [router]);

  async function startEnrollment() {
    setBusy(true);
    setError('');
    try {
      const result = await apiFetch<{ secret: string; otpauthUri: string }>('/v1/mfa/enroll/start', { method: 'POST', body: '{}' });
      const dataUrl = await QRCode.toDataURL(result.otpauthUri, { margin: 1, width: 240 });
      setSecret(result.secret);
      setQrCode(dataUrl);
      setMode('challenge');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'MFA enrollment failed.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const status = await apiFetch<MfaStatus>('/v1/mfa/status');
      const path = status.enrolled ? '/v1/mfa/verify' : '/v1/mfa/enroll/confirm';
      const result = await apiFetch<{ mfaAssertion: string }>(path, {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() }),
      });
      setMfaAssertion(result.mfaAssertion);
      router.replace('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The authenticator code could not be verified.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <BrandLogo variant="full" className="auth-logo" priority />
        <h1>Secure your CEO access</h1>
        <p className="muted">Use an authenticator app to protect privileged Amaal access.</p>

        {mode === 'enroll' ? (
          <div className="mfa-stack">
            <p>Set up your authenticator app once. You will use its six-digit code when signing in.</p>
            <button type="button" onClick={() => void startEnrollment()} disabled={busy}>{busy ? 'Preparing…' : 'Set up authenticator'}</button>
          </div>
        ) : null}

        {qrCode ? (
          <div className="qr-box">
            <Image src={qrCode} alt="Amaal authenticator QR code" width={240} height={240} unoptimized />
            <p className="muted">Scan this code with Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app.</p>
            <div className="setup-secret"><span>Manual key</span><code>{secret}</code></div>
          </div>
        ) : null}

        {mode === 'challenge' ? (
          <form onSubmit={verify} className="auth-form">
            <label>
              Authenticator code
              <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required minLength={6} maxLength={6} autoFocus />
            </label>
            {error ? <p className="error-text" role="alert">{error}</p> : null}
            <button type="submit" disabled={busy || code.trim().length !== 6}>{busy ? 'Verifying…' : secret ? 'Confirm and continue' : 'Verify and continue'}</button>
          </form>
        ) : null}

        {error && mode === 'enroll' ? <p className="error-text" role="alert">{error}</p> : null}
        <button type="button" className="ghost-button auth-secondary" onClick={() => void authClient.signOut().then(() => router.replace('/login'))}>Use another account</button>
        <p className="microcopy">Your authenticator secret is protected by Amaal and is never shown again after setup.</p>
      </section>
    </main>
  );
}
