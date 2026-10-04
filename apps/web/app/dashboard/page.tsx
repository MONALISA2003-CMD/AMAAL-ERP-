'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, publicReady } from '../../lib/api';
import { authClient, clearMfaAssertion } from '../../lib/auth';
import { startAmaalRealtime, type ClientRealtimeEvent } from '../../lib/realtime';
import { BrandLogo } from '../../components/brand-logo';

type Me = {
  user: { id: string; email: string | null };
  accessState: 'ACTIVE' | 'PENDING_ASSIGNMENT' | 'SUSPENDED';
  authorization: { roles: string[]; permissions: string[]; regionIds: string[]; teamIds: string[]; shopIds: string[] };
  mfaRequired: boolean;
  mfaVerified: boolean;
};

type Summary = {
  role: string;
  label: string;
  displayName: string;
  modules: string[];
  visibility: { sales: boolean; inventory: boolean; recovery: boolean; customers: boolean; commission: boolean };
  authorization: Me['authorization'];
  status: 'OPERATIONAL' | 'FOUNDATION_ONLY';
  kpis: {
    sales: { today: { units: number; revenue: number }; week: { units: number; revenue: number }; month: { units: number; revenue: number } };
    inventory: { currentUnits: number };
    aging: { agedUnits: number; criticalUnits: number };
    recovery: { openCases: number; overdueCases: number; highPriorityCases: number };
    customers: { total: number };
    commission: { today: number; month: number };
    notifications: { unread: number };
  };
  hierarchy: { regions: string; managers: string; teams: string; agents: string; shops: string };
  system: { outboxPending: number; realtimeEvents: number; latestSequence: number };
  generatedAt: string;
};

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [api, setApi] = useState<'checking' | 'ready' | 'degraded'>('checking');
  const [error, setError] = useState('');
  const [live, setLive] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [lastEvent, setLastEvent] = useState<ClientRealtimeEvent | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await authClient.getSession();
      if (!session?.data) { router.replace('/login'); return; }
      try {
        const identity = await apiFetch<Me>('/v1/me');
        if (!active) return;
        if (identity.accessState === 'PENDING_ASSIGNMENT') { router.replace('/access-pending'); return; }
        if (identity.accessState === 'SUSPENDED') { router.replace('/access-pending?state=suspended'); return; }
        if (identity.mfaRequired && !identity.mfaVerified) { router.replace('/mfa'); return; }
        const [readiness, data] = await Promise.all([
          publicReady(),
          apiFetch<Summary>('/v1/workspace/summary'),
        ]);
        if (!active) return;
        setMe(identity);
        setSummary(data);
        setApi(readiness.ready && readiness.checks.database === 'ok' ? 'ready' : 'degraded');
      } catch (e) {
        if (!active) return;
        setApi('degraded');
        setError(e instanceof Error ? e.message : 'Unable to load current ERP workspace.');
      }
    })();
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!summary) return;
    return startAmaalRealtime(summary.system.latestSequence, (event) => {
      setLastEvent(event);
      setLive('connected');
      void apiFetch<Summary>('/v1/workspace/summary').then(setSummary).catch(() => setLive('reconnecting'));
    });
  }, [summary?.system.latestSequence]);

  const navigation = useMemo(() => {
    // Keep core ERP routes explicit so each role workspace can progressively expose them.
    const links = [
      ['/dashboard', 'Command Center'],
      ['/organization', 'People & Structure'],
      ['/inventory', 'Inventory & IMEI'],
      ['/customers', 'Customers'],
      ['/sales', 'Sales & Receipts'],
      ['/finance', 'Finance'],
      ['/recovery', 'Recovery'],
      ['/reports', 'Reports'],
      ['/ai', 'Amaal AI'],
    ];
    return links;
  }, []);

  // Phase 4 core routes retained by the Stage 6 shell: href="/customers", href="/sales", href="/finance".

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
          <div><div className="topbar-subtitle">{summary?.label ?? 'Operations'}</div></div>
        </div>
        <div className="topbar-actions">
          <span className={`live-dot ${live}`}>{live === 'connected' ? 'Live' : live === 'reconnecting' ? 'Reconnecting' : 'Connecting'}</span>
          <button className="ghost-button" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="section-label">WORKSPACE</div>
          <nav>{navigation.map(([href, label]) => <a className={`nav-item ${href === '/dashboard' ? 'active' : ''}`} href={href} data-route={href} key={href}>{label}</a>)}</nav>
          <div className="section-label lower">MODULES</div>
          {(summary?.modules ?? []).slice(0, 7).map((module) => <div className="nav-item muted-nav" key={module}>{module}</div>)}
        </aside>

        <section className="content">
          <div className="content-header">
            <div>
              <div className="eyebrow">{summary?.role ?? 'WORKSPACE'}</div>
              <h1>{summary ? `Welcome back, ${summary.displayName}.` : 'Operational truth, at a glance.'}</h1>
              <p className="muted">{summary?.status === 'FOUNDATION_ONLY' ? 'Your workspace is live and permission-aware. Business data will populate as transactions begin.' : 'Current operational performance for your authorized Amaal scope.'}</p>
            </div>
            <div className={`status-pill ${api}`}>{api === 'ready' ? (summary?.status === 'OPERATIONAL' ? 'Live operational data' : 'Foundation ready') : api === 'degraded' ? 'Needs attention' : 'Loading'}</div>
          </div>

          {error ? <div className="alert-card">{error}</div> : null}
          {lastEvent ? <div className="event-banner"><strong>{lastEvent.eventType.replaceAll('_', ' ')}</strong><span>Sequence {lastEvent.sequence}</span></div> : null}

          <div className="metric-grid">
            <Metric label="Sales today" value={summary?.visibility.sales ? `${summary?.kpis.sales.today.units ?? '—'} units` : '—'} sub={summary?.visibility.sales && summary ? money(summary.kpis.sales.today.revenue) : 'restricted'} />
            <Metric label="Month revenue" value={summary?.visibility.sales && summary ? money(summary.kpis.sales.month.revenue) : '—'} sub={summary?.visibility.sales ? `${summary?.kpis.sales.month.units ?? '—'} units` : 'restricted'} />
            <Metric label="Current stock" value={summary?.visibility.inventory ? (summary?.kpis.inventory.currentUnits ?? '—') : '—'} sub={summary?.visibility.inventory ? 'authorized scope' : 'restricted'} />
            <Metric label="Aged stock" value={summary?.visibility.recovery ? (summary?.kpis.aging.agedUnits ?? '—') : '—'} sub={summary?.visibility.recovery ? `${summary?.kpis.aging.criticalUnits ?? '—'} critical` : 'restricted'} />
            <Metric label="Open recovery" value={summary?.visibility.recovery ? (summary?.kpis.recovery.openCases ?? '—') : '—'} sub={summary?.visibility.recovery ? `${summary?.kpis.recovery.overdueCases ?? '—'} overdue` : 'restricted'} />
            <Metric label="Unread alerts" value={summary?.kpis.notifications.unread ?? '—'} sub="your inbox" />
            <Metric label="Customers" value={summary?.visibility.customers ? (summary?.kpis.customers.total ?? '—') : '—'} sub={summary?.visibility.customers ? 'authorized scope' : 'restricted'} />
            <Metric label="Commission this month" value={summary?.visibility.commission && summary ? money(summary.kpis.commission.month) : '—'} sub={summary?.visibility.commission ? 'authorized scope' : 'restricted'} />
          </div>

          <div className="grid two">
            <section className="card">
              <div className="card-label">YOUR ACCESS</div>
              <h2>{me?.user.email ?? 'Loading…'}</h2>
              <div className="chip-row">{(me?.authorization.roles ?? []).map((role) => <span className="chip" key={role}>{role}</span>)}</div>
              <div className="scope-grid">
                <div><span>Regions</span><strong>{summary?.authorization.regionIds.length ?? '—'}</strong></div>
                <div><span>Teams</span><strong>{summary?.authorization.teamIds.length ?? '—'}</strong></div>
                <div><span>Shops</span><strong>{summary?.authorization.shopIds.length ?? '—'}</strong></div>
              </div>
            </section>
            <section className="card emphasis">
              <div className="card-label">AMAAL CONTROL PLANE</div>
              <blockquote>{summary?.label ?? 'Role workspace'}</blockquote>
              <p className="muted">One authorized workspace, backed by Neon truth, Render services and durable event replay.</p>
            </section>
          </div>

          <div className="grid three">
            <section className="card module"><div className="module-icon">SALES</div><h3>Performance</h3><p>Today, week and month sales for your exact organizational scope.</p><span>{summary?.visibility.sales ? `${summary.kpis.sales.today.units} units today` : 'Restricted'}</span></section>
            <section className="card module"><div className="module-icon">STOCK</div><h3>Custody & aging</h3><p>Current stock custody, aged exposure and critical aging signals.</p><span>{summary?.visibility.recovery ? `${summary.kpis.aging.agedUnits} aged units` : 'Restricted'}</span></section>
            <section className="card module"><div className="module-icon">RECOVERY</div><h3>Resolution queue</h3><p>Open, overdue and high-priority recovery work within your authority.</p><span>{summary?.visibility.recovery ? `${summary.kpis.recovery.openCases} open cases` : 'Restricted'}</span></section>
          </div>

          <section className="card roadmap-card">
            <div className="card-label">ROLE WORKSPACE</div>
            <div className="module-pills">{(summary?.modules ?? []).map((module) => {
              const route = moduleHref(module);
              return route ? <a key={module} href={route}>{module}</a> : <span key={module}>{module}</span>;
            })}</div>
          </section>
        </section>
      </div>
    </main>
  );
}

function moduleHref(module: string): string | null {
  const value = module.toLowerCase();
  if (value.includes('customer')) return '/customers';
  if (value.includes('sale') || value.includes('selling')) return '/sales';
  if (value.includes('finance') || value.includes('commission')) return '/finance';
  if (value.includes('recovery') || value.includes('aging')) return '/recovery';
  if (value.includes('stock') || value.includes('inventory') || value.includes('allocation')) return '/inventory';
  if (value.includes('team') || value.includes('user') || value.includes('region') || value.includes('people')) return '/organization';
  return null;
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return <section className="metric-card"><span>{label}</span><strong>{value}</strong><small>{sub}</small></section>;
}
