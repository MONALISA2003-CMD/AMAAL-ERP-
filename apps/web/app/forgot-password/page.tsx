'use client';

import { useEffect, useState, type FormEvent } from 'react';
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
  const [resendCooldown, setResendCooldown] = useState(0);

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
        setMessage('Check your email for a 6-digit code. If you don’t see it, check your spam or junk folder.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start password recovery.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  async function resendCode() {
    if (!email || resendCooldown > 0 || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await requestPasswordReset(email);
      setResendCooldown(45);
      setMessage('A new 6-digit code has been sent. Check your inbox and your spam or junk folder.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We couldn’t send a new code. Please try again.');
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
      setMessage('Your password has been changed. You can now sign in with your new password.');
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
        <h1>Recover your access</h1>
        <p className="muted">Enter the email address you use to sign in to Amaal. We’ll send you a 6-digit code so you can choose a new password.</p>

        {step === 'REQUEST' ? (
          <form onSubmit={requestReset} className="auth-form">
            <label>Email address<input autoComplete="email" inputMode="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            {error ? <p className="error-text" role="alert">{error}</p> : null}
            <button type="submit" disabled={busy}>{busy ? 'Sending your code…' : 'Send my code'}</button>
          </form>
        ) : null}

        {step === 'RESET' ? (
          <form onSubmit={completeReset} className="auth-form">
            <label>Email address<input value={email} readOnly /></label>
            <label>6-digit code<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required /></label>
            <label>New password<input autoComplete="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} /></label>
            <label>Confirm new password<input autoComplete="new-password" type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required minLength={10} /></label>
            {message ? <p className="microcopy" role="status">{message}</p> : null}
            <p className="microcopy">Didn’t receive the code? Check your spam or junk folder. <button type="button" className="link-button" disabled={busy || resendCooldown > 0} onClick={() => void resendCode()}>{resendCooldown > 0 ? `Send again in ${resendCooldown}s` : 'Send a new code'}</button></p>
            {error ? <p className="error-text" role="alert">{error}</p> : null}
            <button type="submit" disabled={busy}>{busy ? 'Changing password…' : 'Change password'}</button>
            <button type="button" className="setup-secondary" disabled={busy} onClick={() => router.replace('/login')}>Return to sign in</button>
          </form>
        ) : null}

        {step === 'DONE' ? (
          <div className="auth-form">
            <p className="microcopy" role="status">{message}</p>
            <button type="button" onClick={() => router.replace('/login')}>Go to sign in</button>
          </div>
        ) : null}

        {step !== 'DONE' ? <p className="microcopy"><a href="/login">Return to sign in</a></p> : null}
      </section>
    </main>
  );
}
