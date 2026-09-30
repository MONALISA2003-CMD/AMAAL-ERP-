'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, publicReady } from '../../lib/api';
import { getSupabaseBrowserClient } from '../../lib/supabase';

type Me = {
  user: { id: string; email: string | null };
  authorization: { roles: string[]; permissions: string[]; regionIds: string[]; teamIds: string[]; shopIds: string[] };
  authenticatorAssuranceLevel: 'aal1' | 'aal2';
  mfaRequired: boolean;
};

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [api, setApi] = useState<'checking' | 'ready' | 'degraded'>('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = await getSupabaseBrowserClient();
      const session = await supabase.auth.getSession();
      if (!session.data.session) {
        router.replace('/login');
        return;
      }
      try {
        const identity = await apiFetch<Me>('/v1/me');
        if (!active) return;
        if (identity.mfaRequired && identity.authenticatorAssuranceLevel !== 'aal2') {
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
    const supabase = await getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-mark small">AMAAL</div>
          <div className="topbar-subtitle">Intelligent Operations Platform</div>
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
          <a className="nav-item" href="#jarvis">Jarvis</a>
        </aside>

        <section className="content">
          <div className="content-header">
            <div>
              <div className="eyebrow">COMMAND CENTER</div>
              <h1>Operational truth, at a glance.</h1>
              <p className="muted">Metrics will appear only when sourced from the authoritative ERP records.</p>
            </div>
            <div className={`status-pill ${api}`}>{api === 'ready' ? 'ERP ready' : api === 'degraded' ? 'ERP degraded' : 'Checking ERP'}</div>
          </div>

          {api === 'degraded' ? <div className="alert-card">The API is reachable, but the authoritative database readiness check is not healthy.</div> : null}

          {error ? <div className="alert-card">{error}</div> : null}

          <div className="grid two">
            <section className="card">
              <div className="card-label">CURRENT IDENTITY</div>
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
              <div className="card-label">SYSTEM PRINCIPLE</div>
              <blockquote>“The ERP creates the truth. Events distribute the truth. Analytics explains the truth. ML predicts from the truth.”</blockquote>
              <p className="muted">Jarvis reasons over authorized truth; it never becomes the truth source.</p>
            </section>
          </div>

          <div className="grid three">
            <section className="card module"><div className="module-icon">IMEI</div><h3>Inventory & custody</h3><p>IMEI state, holder, movement history, aging and controlled transfers.</p><span>Module foundation ready</span></section>
            <section className="card module"><div className="module-icon">SALE</div><h3>Sales & finance</h3><p>Atomic sales, receipts, payment records, reversal and policy-driven commissions.</p><span>Transaction engine ready</span></section>
            <section className="card module"><div className="module-icon">AI</div><h3>Jarvis intelligence</h3><p>Authorization-aware tools over current ERP truth, with approval boundaries.</p><span>Gateway foundation ready</span></section>
          </div>

          <section className="card roadmap-card">
            <div className="card-label">LIVE BUILD STATUS</div>
            <div className="roadmap">
              <div className="roadmap-item done"><span>01</span><div><strong>Truth layer</strong><p>PostgreSQL, RLS, audit, IMEI ledger</p></div></div>
              <div className="roadmap-item done"><span>02</span><div><strong>Transaction layer</strong><p>Sales, allocation, approvals, recovery, reversals</p></div></div>
              <div className="roadmap-item done"><span>03</span><div><strong>Truth distribution</strong><p>Outbox, read models, scoped realtime</p></div></div>
              <div className="roadmap-item current"><span>04</span><div><strong>ERP client</strong><p>Authenticated Next.js/PWA workflows</p></div></div>
              <div className="roadmap-item"><span>05</span><div><strong>Infrastructure</strong><p>Render API/worker and Vercel production client</p></div></div>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
