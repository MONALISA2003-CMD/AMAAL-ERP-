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
        <p className="muted">{suspended ? 'Your identity is authenticated, but Amaal business access is currently suspended. Only the authorized Amaal administration flow can restore it.' : 'Your Neon Auth identity is valid, but it has not yet been assigned an active Amaal role and organizational scope.'}</p>
        <div className="card emphasis"><div className="card-label">SECURITY BOUNDARY</div><p className="muted">Authentication proves who you are. Amaal organizational authorization determines what you can see and do.</p></div>
        <button type="button" className="setup-primary" onClick={async()=>{ await authClient.signOut(); router.replace('/login'); }}>Sign out</button>
      </section>
    </main>
  );
}
