'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '../../components/brand-logo';
import { requestPasswordReset, resetPasswordWithOtp } from '../../lib/password-recovery';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [step, setStep] = useState<'REQUEST' | 'RESET' | 'DONE'>('REQUEST');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await requestPasswordReset(email);
      setEmail(result.email);
      if (result.method === 'OTP') {
        setStep('RESET');
        setMessage('A 6-digit password reset code has been sent to your email.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start password recovery.');
    } finally {
      setBusy(false);
    }
  }

  async function completeReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await resetPasswordWithOtp(email, otp, password, confirmation);
      setOtp('');
      setPassword('');
      setConfirmation('');
      setStep('DONE');
      setMessage('Your password has been reset successfully. You can now sign in with the new password.');
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
        <h1>Recover secure access</h1>
        <p className="muted">Use the work email registered with Neon Auth. Your Amaal role, organization scope and business records are not changed by a password reset.</p>

        {step === 'REQUEST' ? (
          <form onSubmit={requestReset} className="auth-form">
            <label>Work email<input autoComplete="email" inputMode="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            {error ? <p className="error-text" role="alert">{error}</p> : null}
            <button type="submit" disabled={busy}>{busy ? 'Sending recovery instructions…' : 'Send recovery instructions'}</button>
          </form>
        ) : null}

        {step === 'RESET' ? (
          <form onSubmit={completeReset} className="auth-form">
            <label>Email<input value={email} readOnly /></label>
            <label>6-digit reset code<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required /></label>
            <label>New password<input autoComplete="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} /></label>
            <label>Confirm new password<input autoComplete="new-password" type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required minLength={10} /></label>
            {message ? <p className="microcopy" role="status">{message}</p> : null}
            {error ? <p className="error-text" role="alert">{error}</p> : null}
            <button type="submit" disabled={busy}>{busy ? 'Resetting securely…' : 'Reset password'}</button>
            <button type="button" className="setup-secondary" disabled={busy} onClick={() => router.replace('/login')}>Back to login</button>
          </form>
        ) : null}

        {step === 'DONE' ? (
          <div className="auth-form">
            <p className="microcopy" role="status">{message}</p>
            <button type="button" onClick={() => router.replace('/login')}>Continue to login</button>
          </div>
        ) : null}

        {step !== 'DONE' ? <p className="microcopy"><a href="/login">Return to secure login</a></p> : null}
      </section>
    </main>
  );
}
