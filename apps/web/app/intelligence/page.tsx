'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '../../lib/auth';
import { getAmaalIntelligenceSummaryApi, type AmaalIntelligencePrediction } from '../../lib/api';
import { BrandLogo } from '../../components/brand-logo';

function title(kind: string): string {
  const labels: Record<string, string> = { DEMAND_FORECAST: 'Sales outlook', AGING_RISK: 'Aging outlook', RECOVERY_PRIORITY: 'Recovery priorities', ANOMALY: 'Unusual activity', STOCK_OPTIMIZATION: 'Stock planning', PRODUCT_VELOCITY: 'Product movement', REGIONAL_FORECAST: 'Regional outlook', agingRisk: 'Aging outlook', demand: 'Sales outlook', recoveryPriority: 'Recovery priorities', anomalies: 'Unusual activity' };
  return labels[kind] ?? 'Business insight';
}

function valueText(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object') return 'See the details below.';
  return 'See the details below.';
}

function certaintyText(value: number | null): string {
  return value == null ? 'Confidence not available' : `${(value * 100).toFixed(1)}% confidence`;
}

function displayStatus(value: string): string {
  return value === 'PREDICTED' ? 'Ready to review' : value === 'SHADOW' ? 'For review' : value === 'INSUFFICIENT_HISTORY' ? 'Not enough history' : value === 'BLOCKED' ? 'Not available yet' : 'Under review';
}

export default function IntelligencePage() {
  const router = useRouter();
  const [summary, setSummary] = useState<(Awaited<ReturnType<typeof getAmaalIntelligenceSummaryApi>>) | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  async function refresh() {
    setBusy(true); setError('');
    try { setSummary(await getAmaalIntelligenceSummaryApi()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load Amaal intelligence.'); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await authClient.getSession();
      if (!session?.data) { router.replace('/login'); return; }
      try {
        const result = await getAmaalIntelligenceSummaryApi();
        if (active) setSummary(result);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load Amaal intelligence.');
      } finally { if (active) setBusy(false); }
    })();
    const polling = window.setInterval(() => { if (active) void refresh(); }, 30000);
    return () => { active = false; window.clearInterval(polling); };
  }, [router]);

  const groups = useMemo(() => {
    const sections = summary?.sections ?? {};
    return Object.entries(sections) as Array<[string, AmaalIntelligencePrediction[]]>;
  }, [summary]);

  return <main className="app-shell">
    <header className="topbar">
      <div className="topbar-brand"><BrandLogo variant="full" className="topbar-full-logo" priority /><div className="topbar-subtitle">Business intelligence</div></div>
      <a className="ghost-button" href="/dashboard">Back to command center</a>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="section-label">OPERATIONS</div>
        <nav>
          <a className="nav-item" href="/dashboard">Command Center</a>
          <a className="nav-item" href="/inventory">Inventory & Devices</a>
          <a className="nav-item" href="/sales">Sales & Receipts</a>
          <a className="nav-item" href="/customers">Customers</a>
          <a className="nav-item" href="/finance">Finance</a>
          <a className="nav-item" href="/recovery">Recovery</a>
          <a className="nav-item" href="/reports">Reports</a>
          <a className="nav-item active" href="/intelligence">Planning Insights</a>
          <a className="nav-item" href="/organization">People & Structure</a>
        </nav>
        <div className="section-label lower">INTELLIGENCE</div>
        <a className="nav-item" href="/ai">Amaal AI</a>
      </aside>

      <section className="content ai-content">
        <div className="content-header">
          <div>
            <div className="eyebrow">BUSINESS INTELLIGENCE</div>
            <h1>Predictive signals without changing ERP truth.</h1>
            <p className="muted">Forecasts, risk signals and recommendations help you plan ahead. They do not change your business records.</p>
          </div>
          {summary ? <div className="ai-status-pill">For planning and review</div> : null}
        </div>

        {error ? <div className="alert-card">{error}</div> : null}
        {busy && !summary ? <section className="card"><div className="loading-row">Loading business insights…</div></section> : null}

        {summary ? <>
          <div className="grid four kpi-grid">
            <section className="card report-kpi"><span>Planning insights</span><strong>{summary.totals.predictions}</strong><small>Insights available to you.</small></section>
            <section className="card report-kpi"><span>For review</span><strong>{summary.totals.shadow}</strong><small>Suggestions that still need human review.</small></section>
            <section className="card report-kpi"><span>Ready to review</span><strong>{summary.totals.predicted}</strong><small>Planning insights prepared from available business history.</small></section>
            <section className="card report-kpi"><span>Latest update</span><strong>{summary.latestPredictionAt ? new Date(summary.latestPredictionAt).toLocaleTimeString() : '—'}</strong><small>{summary.mode === 'SHADOW_READY' ? 'Ready for planning review.' : 'More business history is being collected.'}</small></section>
          </div>

          {groups.map(([kind, items]) => <section className="card intelligence-ml-section" key={kind}>
            <div className="section-head"><div><div className="card-label">INSIGHT TYPE</div><h2>{title(kind)}</h2></div><span className="chip">{items.length} visible</span></div>
            {!items.length ? <div className="ai-side-note">No new insights are available yet. More business history may be needed.</div> : <div className="ml-prediction-list">
              {items.map((item) => <div className="ml-prediction" key={item.id}>
                <div><div className="card-label">{item.as_of_date}</div><strong>{valueText(item.value)}</strong><p>{Array.isArray(item.explanation) ? (item.explanation as unknown[]).join(' ') : valueText(item.explanation)}</p></div>
                <div className="ml-prediction-meta"><span>{displayStatus(item.status)}</span><span>{certaintyText(item.confidence)}</span><small>{displayStatus(item.status)}</small></div>
              </div>)}
            </div>}
          </section>)}

          <section className="card system-card">
            <div className="section-head"><div><div className="card-label">REVIEW & SAFETY</div><h2>How these insights are used</h2></div></div>
            <div className="method-grid">
              <div><span>Based on</span><p>These insights use recorded Amaal activity and your business records.</p></div>
              <div><span>Training gate</span><p>Enough past activity is checked before a new prediction is prepared. Missing information is not guessed.</p></div>
              <div><span>Validation</span><p>Planning insights are checked against past results before they are relied upon.</p></div>
              <div><span>Activation</span><p>New predictions remain recommendations until they have been reviewed and approved for wider use.</p></div>
            </div>
          </section>
        </> : null}
      </section>
    </div>
  </main>;
}
