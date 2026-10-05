'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { BrandLogo } from '../../components/brand-logo';
import { authClient } from '../../lib/auth';

export default function AccessPendingContent() {
  const router = useRouter();
  const params = useSearchParams();
  const suspended = params.get('state') === 'suspended';
  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <BrandLogo variant="full" className="auth-logo" priority />
        <h1>{suspended ? 'Amaal access is suspended' : 'Amaal access is being prepared'}</h1>
        <p className="muted">{suspended ? 'Your Amaal access is currently paused. An administrator needs to restore your access before you can continue.' : 'Your account is recognized, but your Amaal access has not been set up yet. An administrator needs to finish your access before you can continue.'}</p>
        <div className="card emphasis"><div className="card-label">YOUR ACCESS</div><p className="muted">Your sign-in confirms your account. Your Amaal role controls the areas and information available to you.</p></div>
        <button type="button" className="setup-primary" onClick={async()=>{ await authClient.signOut(); router.replace('/login'); }}>Return to sign in</button>
      </section>
    </main>
  );
}
