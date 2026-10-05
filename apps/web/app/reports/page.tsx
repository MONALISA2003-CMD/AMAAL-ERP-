'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '../../lib/auth';
import { exportOperationalReportCsvApi, getOperationalReportApi } from '../../lib/api';
import { BrandLogo } from '../../components/brand-logo';

type Report = {
  generatedAt: string;
  reportVersion: string;
  role: string;
  period: { label: string; from: string; to: string; timezone: string };
  headline: {
    sales: { transactions: number; units: number; revenue: number; reversedTransactions: number; reversedRevenue: number; transactionsChangePct: number | null; unitsChangePct: number | null; revenueChangePct: number | null };
    paymentMix: { current: { cash: { transactions: number; units: number; revenue: number }; loan: { transactions: number; units: number; revenue: number }; other: Array<{ paymentType: string; transactions: number; units: number; revenue: number }> }; cashRevenueSharePct: number | null; loanRevenueSharePct: number | null };
    commission: { gross: number; adjustments: number; net: number; changePct: number | null };
    inventory: { totalUnits: number; sellableUnits: number; stockValueEstimate: number; avgFieldAgeDays: number | null; avgHolderAgeDays: number | null; sellThroughProxyPct: number | null };
    aging: { dueSoon: number; overdue: number; critical: number };
    recovery: { openCases: number; dueSoon: number; overdue: number; critical: number; opened: number; closed: number; recovered: number; ratePct: number | null; avgRecoveryDays: number | null };
    customers: { visibleCount: number };
    stockConcentration: { totalUnits: number; topTeamSharePct: number; topHolderSharePct: number; teamHhi: number; holderHhi: number; unallocatedUnits: number };
  };
  trend: Array<{ bucket: string; units: number; transactions: number; revenue: number; commission: number }>;
  comparison: { type: string; rows: Array<{ id: string; name: string; secondary: string | null; units: number; transactions: number; revenue: number; commission: number; currentStockUnits: number; agedStockUnits: number; sellThroughProxyPct: number | null }> };
  products: Array<{ variantId: string; brandName: string; modelName: string; sku: string; units: number; revenue: number; avgPrice: number; currentStockUnits: number; sellThroughProxyPct: number | null }>;
  aging: { bands: Record<string, number>; policy: { maximumDays: number; warningDays: number; criticalOverdueDays: number; bandSource: string } | null };
  recovery: { officers: Array<{ userId: string; displayName: string; opened: number; recovered: number; closed: number; avgRecoveryDays: number | null }> };
  inventory: { states: Array<{ state: string; units: number }>; concentration: { unallocatedUnits: number } };
  system: { warnings: string[]; outboxPending: number; realtimeEvents: number; latestSequence: number; readModels: { salesDailyHasTransactionCount: boolean; productDaily: boolean; commissionDaily: boolean }; readModelSalesRows: number; readModelSalesUpdatedAt: string | null; readModelProductRows: number; readModelProductUpdatedAt: string | null; readModelCommissionRows: number; readModelCommissionUpdatedAt: string | null; incompleteSalesScope: number };
  insights: Array<{ severity: 'CRITICAL' | 'WARNING' | 'INFO'; code: string; title: string; detail: string }>;
  methodology: { facts: string[]; estimates: string[]; proxies: string[]; aging: string; comparison: string; caching: string; execution: string };
};

const periods = [
  ['TODAY', 'Today'], ['WEEK', 'This Week'], ['MONTH', 'This Month'], ['3M', '3 Months'], ['6M', '6 Months'], ['12M', '12 Months'],
] as const;
const comparisons = [['AGENT', 'Agents'], ['TEAM', 'Teams'], ['MANAGER', 'Managers'], ['REGION', 'Regions']] as const;

function money(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}
function pct(value: number | null | undefined): string { return value == null ? '—' : `${value.toFixed(1)}%`; }
function fmtDate(value: string): string { return new Date(value).toLocaleDateString(); }
function change(value: number | null | undefined): string { return value == null ? 'No prior baseline' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`; }

export default function ReportsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<(typeof periods)[number][0]>('MONTH');
  const [comparison, setComparison] = useState<(typeof comparisons)[number][0]>('TEAM');
  const [exporting, setExporting] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      const session = await authClient.getSession();
      if (!session?.data) { router.replace('/login'); return; }
      setBusy(true); setError('');
      try {
        const data = await getOperationalReportApi({ period, comparison });
        if (active) setReport(data as Report);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load the reporting center.');
      } finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, [router, period, comparison]);

  const maxTrend = useMemo(() => Math.max(...(report?.trend ?? []).map((x) => Number(x.revenue) || 0), 1), [report]);

  return <main className="app-shell">
    <header className="topbar">
      <div className="topbar-brand"><BrandLogo variant="full" className="topbar-full-logo" priority /><div className="topbar-subtitle">Reporting & Operational Intelligence</div></div>
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
          <a className="nav-item active" href="/reports">Reports</a>
          <a className="nav-item" href="/intelligence">ML Intelligence</a>
          <a className="nav-item" href="/organization">People & Structure</a>
        </nav>
        <div className="section-label lower">INTELLIGENCE</div>
        <a className="nav-item" href="/ai">Amaal AI</a>
      </aside>

      <section className="content reports-content">
        <div className="content-header">
          <div>
            <div className="eyebrow">REPORTING CENTER</div>
            <h1>See the operation across time and hierarchy.</h1>
            <p className="muted">Clear business information from your Amaal records. The figures shown here are calculated from recorded activity.</p>
          </div>
          {report ? <div className="report-role-chip">{report.role} • v{report.reportVersion}</div> : null}
        </div>

        <div className="report-controls card">
          <div className="control-group"><span className="card-label">PERIOD</span><div className="segmented">{periods.map(([key, label]) => <button key={key} className={period === key ? 'selected' : ''} onClick={() => setPeriod(key)}>{label}</button>)}</div></div>
          <div className="control-group"><span className="card-label">COMPARE</span><div className="segmented">{comparisons.map(([key, label]) => <button key={key} className={comparison === key ? 'selected' : ''} onClick={() => setComparison(key)}>{label}</button>)}</div></div><div className="report-control-actions"><button className="setup-secondary" disabled={exporting || !report} onClick={async () => { setExporting(true); setError(''); try { const exported = await exportOperationalReportCsvApi({ period, comparison }); const blob = new Blob([exported.csv], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = exported.filename; document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to export the report.'); } finally { setExporting(false); } }}>{exporting ? 'Preparing CSV…' : 'Export CSV'}</button></div>
        </div>

        {error ? <div className="alert-card">{error}</div> : null}
        {busy && !report ? <section className="card"><div className="loading-row">Building the authorized report…</div></section> : null}

        {report ? <>
          <div className="report-meta muted">{report.period.label} • {fmtDate(report.period.from)} – {fmtDate(report.period.to)} • {report.period.timezone} • generated {new Date(report.generatedAt).toLocaleTimeString()}</div>

          {report.system.warnings.length ? <section className="card report-quality-card"><div><div className="card-label">INFORMATION QUALITY</div><strong>{report.system.warnings.length} note{report.system.warnings.length === 1 ? '' : 's'}</strong></div><div className="quality-list">{report.system.warnings.slice(0, 6).map((warning) => <div key={warning}>• {warning}</div>)}</div></section> : null}

          <div className="grid four kpi-grid">
            <section className="card report-kpi"><span>Sales revenue</span><strong>{money(report.headline.sales.revenue)}</strong><small>{money(report.headline.sales.units)} units • {money(report.headline.sales.transactions)} transactions • {change(report.headline.sales.revenueChangePct)} vs prior</small></section>
            <section className="card report-kpi"><span>Net commission</span><strong>{money(report.headline.commission.net)}</strong><small>{money(report.headline.commission.gross)} gross • {money(report.headline.commission.adjustments)} adjustments • {change(report.headline.commission.changePct)}</small></section>
            <section className="card report-kpi"><span>Current stock available to sell</span><strong>{money(report.headline.inventory.sellableUnits)}</strong><small>Est. value {money(report.headline.inventory.stockValueEstimate)} • sell-through estimate {pct(report.headline.inventory.sellThroughProxyPct)}</small></section>
            <section className="card report-kpi"><span>Recovery throughput</span><strong>{pct(report.headline.recovery.ratePct)}</strong><small>{report.headline.recovery.recovered} recovered • {report.headline.recovery.openCases} open • {report.headline.recovery.overdue} overdue</small></section>
          </div>

          <div className="grid four">
            <section className="card intelligence-card"><div className="card-label">CUSTOMERS</div><strong>{money(report.headline.customers.visibleCount)}</strong><p className="muted">Customers visible inside this authorization scope.</p></section>
            <section className="card intelligence-card"><div className="card-label">AGING</div><strong>{money(report.headline.aging.overdue)}</strong><p className="muted">Overdue devices • {report.headline.aging.critical} critical • {report.headline.aging.dueSoon} due soon.</p></section>
            <section className="card intelligence-card"><div className="card-label">STOCK CONCENTRATION</div><strong>{pct(report.headline.stockConcentration.topHolderSharePct)}</strong><p className="muted">Top-holder share • {pct(report.headline.stockConcentration.topTeamSharePct)} top-team share.</p></section>
            <section className="card intelligence-card"><div className="card-label">PAYMENT MIX</div><strong>{pct(report.headline.paymentMix.cashRevenueSharePct)}</strong><p className="muted">Cash revenue share • {pct(report.headline.paymentMix.loanRevenueSharePct)} loan. Reversed sales: {report.headline.sales.reversedTransactions}.</p></section>
          </div>

          <section className="card insights-card">
            <div className="section-head"><div><div className="card-label">OPERATIONAL SIGNALS</div><h2>Exceptions worth attention</h2></div><span className="muted">Rule-based • no AI inference</span></div>
            <div className="insight-list">{report.insights.map((item) => <article className={`insight ${item.severity.toLowerCase()}`} key={item.code}><div className="insight-severity">{item.severity}</div><div><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}</div>
          </section>

          <div className="grid two">
            <section className="card"><div className="card-label">SALES TREND</div><div className="bar-chart">{report.trend.map((x) => <div className="bar-row" key={x.bucket}><span>{fmtDate(x.bucket)}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(1, (Number(x.revenue) / maxTrend) * 100)}%` }} /></div><strong>{money(x.revenue)}</strong></div>)}</div><div className="trend-summary"><span>{money(report.headline.sales.units)} units</span><span>{money(report.headline.sales.transactions)} transactions</span><span>{money(report.headline.commission.net)} commission</span></div></section>
            <section className="card"><div className="card-label">AGING EXPOSURE</div><div className="aging-grid">{Object.entries(report.aging.bands).map(([key, value]) => <div key={key} className="aging-tile"><span>{key}</span><strong>{value}</strong><small>units</small></div>)}</div><p className="muted">Policy: {report.aging.policy ? `${report.aging.policy.warningDays} warning / ${report.aging.policy.maximumDays} maximum / ${report.aging.policy.criticalOverdueDays} critical-overdue days` : 'approved default'}</p></section>
          </div>

          <section className="card payment-mix-card"><div className="section-head"><div><div className="card-label">PAYMENT MIX • CASH VS LOAN</div><h2>Commercial mix</h2></div><span className="muted">Descriptive period mix from committed sales</span></div><div className="grid three"><div className="metric-tile"><span>Cash revenue</span><strong>{money(report.headline.paymentMix.current.cash.revenue)}</strong><small>{report.headline.paymentMix.current.cash.transactions} transactions • {report.headline.paymentMix.current.cash.units} units</small></div><div className="metric-tile"><span>Loan revenue</span><strong>{money(report.headline.paymentMix.current.loan.revenue)}</strong><small>{report.headline.paymentMix.current.loan.transactions} transactions • {report.headline.paymentMix.current.loan.units} units</small></div><div className="metric-tile"><span>Reversed revenue</span><strong>{money(report.headline.sales.reversedRevenue)}</strong><small>{report.headline.sales.reversedTransactions} reversed transaction(s)</small></div></div></section>

          <section className="card"><div className="section-head"><div><div className="card-label">HIERARCHY COMPARISON</div><h2>{comparisons.find((x) => x[0] === comparison)?.[1]}</h2></div><span className="muted">Units • transactions • revenue • net commission • stock • aging</span></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Secondary</th><th>Transactions</th><th>Units</th><th>Revenue</th><th>Commission</th><th>Stock</th><th>Aged</th><th>Sell-through</th></tr></thead><tbody>{report.comparison.rows.map((row) => <tr key={row.id}><td><strong>{row.name}</strong></td><td>{row.secondary ?? '—'}</td><td>{row.transactions}</td><td>{row.units}</td><td>{money(row.revenue)}</td><td>{money(row.commission)}</td><td>{row.currentStockUnits}</td><td>{row.agedStockUnits}</td><td>{pct(row.sellThroughProxyPct)}</td></tr>)}{!report.comparison.rows.length ? <tr><td colSpan={9} className="muted">No comparable entities are currently present inside the selected scope.</td></tr> : null}</tbody></table></div></section>

          <div className="grid two">
            <section className="card"><div className="card-label">PRODUCT PERFORMANCE</div><div className="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Units</th><th>Revenue</th><th>Avg price</th><th>Stock</th><th>Sell-through</th></tr></thead><tbody>{report.products.slice(0, 15).map((product) => <tr key={product.variantId}><td>{product.brandName} {product.modelName}</td><td>{product.sku}</td><td>{product.units}</td><td>{money(product.revenue)}</td><td>{money(product.avgPrice)}</td><td>{product.currentStockUnits}</td><td>{pct(product.sellThroughProxyPct)}</td></tr>)}{!report.products.length ? <tr><td colSpan={7} className="muted">No product sales were recorded for this period.</td></tr> : null}</tbody></table></div></section>
            <section className="card"><div className="card-label">STOCK CONCENTRATION</div><div className="concentration-stack"><div><span>Total scoped units</span><strong>{report.headline.stockConcentration.totalUnits}</strong></div><div><span>Unallocated</span><strong>{report.headline.stockConcentration.unallocatedUnits}</strong></div><div><span>Top team share</span><strong>{pct(report.headline.stockConcentration.topTeamSharePct)}</strong></div><div><span>Top holder share</span><strong>{pct(report.headline.stockConcentration.topHolderSharePct)}</strong></div><div><span>Team HHI</span><strong>{Number(report.headline.stockConcentration.teamHhi).toFixed(0)}</strong></div><div><span>Holder HHI</span><strong>{Number(report.headline.stockConcentration.holderHhi).toFixed(0)}</strong></div></div><p className="muted">This view shows how stock is distributed across teams and holders.</p></section>
          </div>

          <div className="grid two">
            <section className="card"><div className="card-label">RECOVERY PERFORMANCE</div><div className="table-wrap"><table><thead><tr><th>Officer</th><th>Opened</th><th>Recovered</th><th>Closed</th><th>Avg days</th></tr></thead><tbody>{report.recovery.officers.slice(0, 12).map((officer) => <tr key={officer.userId}><td>{officer.displayName}</td><td>{officer.opened}</td><td>{officer.recovered}</td><td>{officer.closed}</td><td>{officer.avgRecoveryDays == null ? '—' : officer.avgRecoveryDays.toFixed(1)}</td></tr>)}{!report.recovery.officers.length ? <tr><td colSpan={5} className="muted">No recovery activity was recorded for this period.</td></tr> : null}</tbody></table></div></section>
            <section className="card"><div className="card-label">INVENTORY POSITION</div><div className="mini-list">{report.inventory.states.slice(0, 12).map((state) => <div key={state.state}><span>{state.state}</span><strong>{state.units}</strong></div>)}</div><p className="muted">Average field age: {report.headline.inventory.avgFieldAgeDays == null ? '—' : `${report.headline.inventory.avgFieldAgeDays.toFixed(1)} days`} • current holder age: {report.headline.inventory.avgHolderAgeDays == null ? '—' : `${report.headline.inventory.avgHolderAgeDays.toFixed(1)} days`}</p></section>
          </div>

          <section className="card methodology-card">
            <div className="card-label">HOW THIS REPORT IS PREPARED</div>
            <div className="method-grid">
              <div><span>Recorded figures</span>{report.methodology.facts.map((item) => <p key={item}>• {item}</p>)}</div>
              <div><span>Estimates</span>{report.methodology.estimates.map((item) => <p key={item}>• {item}</p>)}</div>
              <div><span>Calculated indicators</span>{report.methodology.proxies.map((item) => <p key={item}>• {item}</p>)}</div>
              <div><span>Aging rules</span><p>{report.methodology.aging}</p></div>
              <div><span>Comparison</span><p>{report.methodology.comparison}</p></div>
              <div><span>Refresh</span><p>{report.methodology.caching}</p></div><div><span>Safety check</span><p>{report.methodology.execution}</p></div>
            </div>
          </section>

          <section className="card system-card"><div className="section-head"><div><div className="card-label">INFORMATION FRESHNESS</div><h2>Report freshness</h2></div><span className="muted">Shown to people with reporting access</span></div><div className="system-grid"><div><span>Updates waiting</span><strong>{report.system.outboxPending}</strong></div><div><span>Recent updates</span><strong>{report.system.realtimeEvents}</strong></div><div><span>Latest update number</span><strong>{report.system.latestSequence}</strong></div><div><span>Sales with missing details</span><strong>{report.system.incompleteSalesScope}</strong></div><div><span>Sales records included</span><strong>{report.system.readModelSalesRows}</strong></div><div><span>Product records included</span><strong>{report.system.readModelProductRows}</strong></div><div><span>Commission records included</span><strong>{report.system.readModelCommissionRows}</strong></div><div><span>Report sections ready</span><strong>{[report.system.readModels.salesDailyHasTransactionCount, report.system.readModels.productDaily, report.system.readModels.commissionDaily].filter(Boolean).length}/3</strong></div></div></section>
        </> : null}
      </section>
    </div>
  </main>;
}
