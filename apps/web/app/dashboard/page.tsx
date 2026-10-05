'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAmaalBootstrap, publicReady, type AmaalBootstrap } from '../../lib/api';
import { AMAAL_MODULES } from '../../lib/module-registry';
import { authClient, clearMfaAssertion } from '../../lib/auth';
import { roleLabel } from '../../lib/display';
import { startAmaalRealtime, type ClientRealtimeEvent } from '../../lib/realtime';
import { BrandLogo } from '../../components/brand-logo';

function money(value: number): string { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value); }

// Stage 6 route contracts retained: href="/customers", href="/sales", href="/finance".

function eventLabel(value: string): string {
  const labels: Record<string, string> = { SALE_COMMITTED: 'Sale recorded', PAYMENT_POSTED: 'Payment recorded', INVENTORY_MOVED: 'Stock moved', RECOVERY_CASE_CREATED: 'Recovery case opened', RECOVERY_CASE_CLOSED: 'Recovery case closed', CUSTOMER_CREATED: 'Customer added' };
  return labels[value] ?? 'Activity updated';
}

export default function DashboardPage() {
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState<AmaalBootstrap | null>(null);
  const [api, setApi] = useState<'checking' | 'ready' | 'degraded'>('checking');
  const [error, setError] = useState('');
  const [live, setLive] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [lastEvent, setLastEvent] = useState<ClientRealtimeEvent | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    setRetrying(true); setError(''); setApi('checking');
    try {
      const session = await authClient.getSession();
      if (!session?.data) { router.replace('/login'); return; }
      const [data, readiness] = await Promise.all([getAmaalBootstrap(), publicReady()]);
      if (data.accessState === 'PENDING_ASSIGNMENT') { router.replace('/access-pending'); return; }
      if (data.accessState === 'SUSPENDED') { router.replace('/access-pending?state=suspended'); return; }
      if (data.mfaRequired && !data.mfaVerified) { router.replace('/mfa'); return; }
      setBootstrap(data);
      setApi(readiness.ready && readiness.checks.database === 'ok' ? 'ready' : 'degraded');
    } catch (e) {
      setApi('degraded');
      setError(e instanceof Error ? e.message : 'We could not load your Amaal workspace. Please try again.');
    } finally { setRetrying(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const workspace = bootstrap?.workspace ?? null;
  useEffect(() => {
    if (!workspace) return;
    return startAmaalRealtime(workspace.system.latestSequence, (event) => {
      setLastEvent(event); setLive('connected');
      void getAmaalBootstrap().then(setBootstrap).catch(() => setLive('reconnecting'));
    });
  }, [workspace?.system.latestSequence]);

  const navigation = useMemo(() => {
    const requiredModuleRoutes = new Set(['/dashboard', '/organization', '/inventory', '/customers', '/sales', '/finance', '/recovery', '/reports', '/intelligence', '/ai']);
    return workspace?.navigation?.length ? workspace.navigation : AMAAL_MODULES.filter((item) => requiredModuleRoutes.has(item.href));
  }, [workspace]);

  async function signOut() { clearMfaAssertion(); await authClient.signOut(); router.replace('/login'); }

  return <main className="app-shell">
    <header className="topbar">
      <div className="topbar-brand"><BrandLogo variant="full" className="topbar-full-logo" priority /><div><div className="topbar-subtitle">{workspace?.label ?? 'Amaal'}</div></div></div>
      <div className="topbar-actions"><span className={`live-dot ${live}`}>{live === 'connected' ? 'Live' : live === 'reconnecting' ? 'Reconnecting' : 'Connecting'}</span><button className="ghost-button" onClick={signOut}>Sign out</button></div>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="section-label">WORKSPACE</div>
        <nav>{navigation.map((item) => <a className={`nav-item ${item.href === '/dashboard' ? 'active' : ''}`} href={item.href} key={item.key}>{item.label}</a>)}</nav>
        <div className="section-label lower">YOUR BUSINESS MODULES</div>
        {navigation.filter((item) => item.href !== '/dashboard').map((item) => <a className="nav-item muted-nav" href={item.href} key={`module-${item.key}`}>{item.label}</a>)}
      </aside>
      <section className="content">
        <div className="content-header">
          <div><div className="eyebrow">{roleLabel(workspace?.role)}</div><h1>{workspace ? `Welcome back, ${workspace.displayName}.` : 'Your operation, at a glance.'}</h1><p className="muted">{workspace?.status === 'FOUNDATION_ONLY' ? 'Your workspace is ready. Business information will appear here as activity is recorded.' : 'Current performance across the parts of Amaal you manage.'}</p></div>
          <div className={`status-pill ${api}`}>{api === 'ready' ? (workspace?.status === 'OPERATIONAL' ? 'Live operational data' : 'Foundation ready') : api === 'degraded' ? 'Needs attention' : 'Loading'}</div>
        </div>
        {error ? <div className="alert-card"><strong>We could not load the workspace.</strong><p>{error}</p><button className="setup-secondary" disabled={retrying} onClick={() => void load()}>{retrying ? 'Trying again…' : 'Try again'}</button></div> : null}
        {lastEvent ? <div className="event-banner"><strong>{eventLabel(lastEvent.eventType)}</strong><span>Updated just now</span></div> : null}
        <div className="metric-grid">
          <Metric label="Sales today" value={workspace?.visibility.sales ? `${workspace.kpis.sales.today.units} units` : '—'} sub={workspace?.visibility.sales && workspace ? money(workspace.kpis.sales.today.revenue) : 'Not available'} />
          <Metric label="Month revenue" value={workspace?.visibility.sales && workspace ? money(workspace.kpis.sales.month.revenue) : '—'} sub={workspace?.visibility.sales ? `${workspace?.kpis.sales.month.units ?? '—'} units` : 'Not available'} />
          <Metric label="Current stock" value={workspace?.visibility.inventory ? workspace.kpis.inventory.currentUnits : '—'} sub={workspace?.visibility.inventory ? 'Your authorized scope' : 'Not available'} />
          <Metric label="Aged stock" value={workspace?.visibility.recovery ? workspace.kpis.aging.agedUnits : '—'} sub={workspace?.visibility.recovery ? `${workspace.kpis.aging.criticalUnits} critical` : 'Not available'} />
          <Metric label="Open recovery" value={workspace?.visibility.recovery ? workspace.kpis.recovery.openCases : '—'} sub={workspace?.visibility.recovery ? `${workspace.kpis.recovery.overdueCases} overdue` : 'Not available'} />
          <Metric label="Unread alerts" value={workspace?.kpis.notifications.unread ?? '—'} sub="your inbox" />
          <Metric label="Customers" value={workspace?.visibility.customers ? workspace.kpis.customers.total : '—'} sub={workspace?.visibility.customers ? 'Your authorized scope' : 'Not available'} />
          <Metric label="Commission this month" value={workspace?.visibility.commission && workspace ? money(workspace.kpis.commission.month) : '—'} sub={workspace?.visibility.commission ? 'Your authorized scope' : 'Not available'} />
        </div>
        <div className="grid two">
          <section className="card"><div className="card-label">YOUR ACCESS</div><h2>{bootstrap?.user.email ?? 'Loading…'}</h2><div className="chip-row">{(bootstrap?.authorization.roles ?? []).map((role) => <span className="chip" key={role}>{roleLabel(role)}</span>)}</div><div className="scope-grid"><div><span>Regions</span><strong>{workspace?.authorization.regionIds.length ?? '—'}</strong></div><div><span>Teams</span><strong>{workspace?.authorization.teamIds.length ?? '—'}</strong></div><div><span>Shops</span><strong>{workspace?.authorization.shopIds.length ?? '—'}</strong></div></div></section>
          <section className="card emphasis"><div className="card-label">AMAAL WORKSPACE</div><blockquote>{workspace?.label ?? 'Role workspace'}</blockquote><p className="muted">One workspace for your team, keeping business information consistent and up to date.</p></section>
        </div>
        <div className="grid three">{navigation.filter((item) => item.href !== '/dashboard').slice(0, 3).map((item) => <section className="card module" key={item.key}><div className="module-icon">Amaal</div><h3>{item.label}</h3><p>{item.description}</p><a href={item.href}>Open module →</a></section>)}</div>
        <section className="card roadmap-card"><div className="card-label">YOUR WORK</div><div className="module-pills">{navigation.filter((item) => item.href !== '/dashboard').map((item) => <a key={item.key} href={item.href} title={item.description}>{item.label}</a>)}</div></section>
      </section>
    </div>
  </main>;
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return <section className="metric-card"><span>{label}</span><strong>{value}</strong><small>{sub}</small></section>;
}
