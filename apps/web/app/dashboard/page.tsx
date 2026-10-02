'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, publicReady } from '../../lib/api';
import { authClient, clearMfaAssertion } from '../../lib/auth';
import { BrandLogo } from '../../components/brand-logo';

type Me = {
  user: { id: string; email: string | null };
  authorization: { roles: string[]; permissions: string[]; regionIds: string[]; teamIds: string[]; shopIds: string[] };
  mfaRequired: boolean;
  mfaVerified: boolean;
};

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [api, setApi] = useState<'checking' | 'ready' | 'degraded'>('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await authClient.getSession();
      if (!session?.data) {
        router.replace('/login');
        return;
      }
      try {
        const identity = await apiFetch<Me>('/v1/me');
        if (!active) return;
        if (identity.mfaRequired && !identity.mfaVerified) {
          router.replace('/mfa');
          return;
        }
        const readiness = await publicReady();
        if (!active) return;
        setMe(identity);
        setApi(readiness.ready && readiness.checks.database === 'ok' ? 'ready' : 'degraded');
      } catch (e) {
        if (!active) return;
        setApi('degraded');
        setError(e instanceof Error ? e.message : 'Unable to load current ERP context.');
      }
    })();
    return () => { active = false; };
  }, [router]);

  async function signOut() {
    clearMfaAssertion();
    await authClient.signOut();
    router.replace('/login');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <BrandLogo variant="full" className="topbar-full-logo" priority />
          <div className="topbar-subtitle">Operations</div>
        </div>
        <button className="ghost-button" onClick={signOut}>Sign out</button>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="section-label">OPERATIONS</div>
          <nav>
            <a className="nav-item active" href="/dashboard">Command Center</a>
            <a className="nav-item" href="#inventory">Inventory & IMEI</a>
            <a className="nav-item" href="#sales">Sales & Receipts</a>
            <a className="nav-item" href="#recovery">Recovery</a>
            <a className="nav-item" href="#approvals">Approvals</a>
            <a className="nav-item" href="#reports">Reports</a>
          </nav>
          <div className="section-label lower">INTELLIGENCE</div>
          <a className="nav-item" href="#amaal-ai">Amaal AI</a>
        </aside>

        <section className="content">
          <div className="content-header">
            <div>
              <div className="eyebrow">COMMAND CENTER</div>
              <h1>Operational truth, at a glance.</h1>
              <p className="muted">Your current Amaal activity and performance will appear here.</p>
            </div>
            <div className={`status-pill ${api}`}>{api === 'ready' ? 'Ready' : api === 'degraded' ? 'Needs attention' : 'Loading'}</div>
          </div>

          {api === 'degraded' ? <div className="alert-card">Some information is temporarily unavailable. Please try again shortly.</div> : null}

          {error ? <div className="alert-card">{error}</div> : null}

          <div className="grid two">
            <section className="card">
              <div className="card-label">YOUR ACCESS</div>
              <h2>{me?.user.email ?? 'Loading…'}</h2>
              <div className="chip-row">
                {(me?.authorization.roles ?? []).map((role) => <span className="chip" key={role}>{role}</span>)}
              </div>
              <div className="scope-grid">
                <div><span>Regions</span><strong>{me ? me.authorization.regionIds.length : '—'}</strong></div>
                <div><span>Teams</span><strong>{me ? me.authorization.teamIds.length : '—'}</strong></div>
                <div><span>Shops</span><strong>{me ? me.authorization.shopIds.length : '—'}</strong></div>
              </div>
            </section>
            <section className="card emphasis">
              <div className="card-label">AMAAL</div>
              <blockquote>Everything you need to run the business, in one place.</blockquote>
              <p className="muted">Keep an eye on stock, sales, recovery, approvals and team activity from your workspace.</p>
            </section>
          </div>

          <div className="grid three">
            <section className="card module"><div className="module-icon">IMEI</div><h3>Inventory & custody</h3><p>IMEI state, holder, movement history, aging and controlled transfers.</p><span>Available</span></section>
            <section className="card module"><div className="module-icon">SALE</div><h3>Sales & finance</h3><p>Atomic sales, receipts, payment records, reversal and policy-driven commissions.</p><span>Available</span></section>
            <section className="card module"><div className="module-icon">AI</div><h3>Amaal AI intelligence</h3><p>Authorization-aware tools over current ERP truth, with approval boundaries.</p><span>Available</span></section>
          </div>

          <section className="card roadmap-card">
            <div className="card-label">YOUR WORKSPACE</div>
            <div className="roadmap">
              <div className="roadmap-item done"><span>01</span><div><strong>Inventory</strong><p>Track devices, custody and movement.</p></div></div>
              <div className="roadmap-item done"><span>02</span><div><strong>Sales</strong><p>Record sales, payments and receipts.</p></div></div>
              <div className="roadmap-item current"><span>03</span><div><strong>Recovery</strong><p>Keep overdue devices moving toward resolution.</p></div></div>
              <div className="roadmap-item"><span>04</span><div><strong>Approvals</strong><p>Review work that needs your attention.</p></div></div>
              <div className="roadmap-item"><span>05</span><div><strong>Reports</strong><p>See performance and operational trends.</p></div></div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
