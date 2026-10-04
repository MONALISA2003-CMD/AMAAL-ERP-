'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '../../lib/auth';
import { getAmaalIntelligenceSummaryApi, type AmaalIntelligencePrediction } from '../../lib/api';
import { BrandLogo } from '../../components/brand-logo';

function title(kind: string): string {
  return kind.replaceAll('_', ' ');
}

function valueText(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  try { return JSON.stringify(value, null, 0); } catch { return 'Derived prediction'; }
}

function confidenceText(value: number | null): string {
  return value == null ? 'Not calibrated' : `${(value * 100).toFixed(1)}%`;
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
      <div className="topbar-brand"><BrandLogo variant="full" className="topbar-full-logo" priority /><div className="topbar-subtitle">Python + ML Intelligence</div></div>
      <a className="ghost-button" href="/dashboard">Back to command center</a>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="section-label">OPERATIONS</div>
        <nav>
          <a className="nav-item" href="/dashboard">Command Center</a>
          <a className="nav-item" href="/inventory">Inventory & IMEI</a>
          <a className="nav-item" href="/sales">Sales & Receipts</a>
          <a className="nav-item" href="/customers">Customers</a>
          <a className="nav-item" href="/finance">Finance</a>
          <a className="nav-item" href="/recovery">Recovery</a>
          <a className="nav-item" href="/reports">Reports</a>
          <a className="nav-item active" href="/intelligence">ML Intelligence</a>
          <a className="nav-item" href="/organization">People & Structure</a>
        </nav>
        <div className="section-label lower">INTELLIGENCE</div>
        <a className="nav-item" href="/ai">Amaal AI</a>
      </aside>

      <section className="content ai-content">
        <div className="content-header">
          <div>
            <div className="eyebrow">STAGE 9 • PYTHON + ML</div>
            <h1>Predictive signals without changing ERP truth.</h1>
            <p className="muted">Forecasts, risk signals and optimization recommendations are derived intelligence. They never mutate stock, sales, recovery, finance or authorization state.</p>
          </div>
          {summary ? <div className="ai-status-pill">{summary.mode} • schema {summary.featureSchemaVersion}</div> : null}
        </div>

        {error ? <div className="alert-card">{error}</div> : null}
        {busy && !summary ? <section className="card"><div className="loading-row">Loading governed intelligence…</div></section> : null}

        {summary ? <>
          <div className="grid four kpi-grid">
            <section className="card report-kpi"><span>Predictions</span><strong>{summary.totals.predictions}</strong><small>Persisted derived outputs visible to your current scope.</small></section>
            <section className="card report-kpi"><span>Shadow</span><strong>{summary.totals.shadow}</strong><small>Signals deliberately not promoted to autonomous authority.</small></section>
            <section className="card report-kpi"><span>Model-ready outputs</span><strong>{summary.totals.predicted}</strong><small>Prediction records marked PREDICTED.</small></section>
            <section className="card report-kpi"><span>Latest refresh</span><strong>{summary.latestPredictionAt ? new Date(summary.latestPredictionAt).toLocaleTimeString() : '—'}</strong><small>{summary.activation}</small></section>
          </div>

          {groups.map(([kind, items]) => <section className="card intelligence-ml-section" key={kind}>
            <div className="section-head"><div><div className="card-label">MODEL FAMILY</div><h2>{title(kind)}</h2></div><span className="chip">{items.length} visible</span></div>
            {!items.length ? <div className="ai-side-note">No current predictions are available in this authorized scope. That is expected while the Stage 9 history/label gates are unmet.</div> : <div className="ml-prediction-list">
              {items.map((item) => <div className="ml-prediction" key={item.id}>
                <div><div className="card-label">{item.entity_type} • {item.as_of_date}</div><strong>{valueText(item.value)}</strong><p>{Array.isArray(item.explanation) ? (item.explanation as unknown[]).join(' ') : valueText(item.explanation)}</p></div>
                <div className="ml-prediction-meta"><span>{item.status}</span><span>{confidenceText(item.confidence)}</span><small>{item.model_key} v{item.model_version}</small></div>
              </div>)}
            </div>}
          </section>)}

          <section className="card system-card">
            <div className="section-head"><div><div className="card-label">GOVERNANCE</div><h2>How Stage 9 is controlled</h2></div></div>
            <div className="method-grid">
              <div><span>Source</span><p>Neon derived reporting models and point-in-time feature snapshots. Transactional ERP records remain authoritative.</p></div>
              <div><span>Training gate</span><p>Temporal history and label sufficiency are checked before candidate training. The system does not invent missing history.</p></div>
              <div><span>Validation</span><p>Time-aware validation is used for temporal models; probability models require calibration checks before production consideration.</p></div>
              <div><span>Activation</span><p>Models remain shadow/recommendation outputs until governance and Stage 10 production gates are completed.</p></div>
            </div>
          </section>
        </> : null}
      </section>
    </div>
  </main>;
}
