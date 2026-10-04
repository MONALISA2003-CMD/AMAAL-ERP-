import type { ApiServices } from './index.ts';
import { getOperationalReport, type OperationalReportRequest } from './reporting.ts';
import { loadAuthorizationContext } from '@amaal/permissions';

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

type ReportForExport = {
  generatedAt: string;
  reportVersion: string;
  period: { label: string; from: string; to: string };
  headline: {
    sales: Record<string, unknown>;
    paymentMix: { current?: Record<string, unknown>; cashRevenueSharePct?: number | null; loanRevenueSharePct?: number | null };
    commission: Record<string, unknown>;
    inventory: Record<string, unknown>;
    aging: Record<string, unknown>;
    recovery: Record<string, unknown>;
  };
  comparison: { rows: Array<Record<string, unknown>> };
  trend: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  recovery: { officers: Array<Record<string, unknown>> };
  insights: Array<Record<string, unknown>>;
};

export async function getOperationalReportCsv(
  services: ApiServices,
  requestId: string,
  actorUserId: string,
  input: OperationalReportRequest,
): Promise<{ filename: string; csv: string }> {
  await services.transactions.withTransaction(
    { requestId: `${requestId}-report-export-auth`, actorUserId },
    async (tx) => {
      const context = await loadAuthorizationContext(tx, actorUserId);
      if (!context.roles.includes('CEO') && !context.permissions.includes('reports.export')) {
        throw new Error('Report export is not authorized for this account.');
      }
    },
  );

  const report = await getOperationalReport(services, requestId, actorUserId, input) as ReportForExport;
  const lines: string[] = ['section,name,value,secondary,tertiary'];
  const push = (section: string, name: string, value: unknown, secondary: unknown = '', tertiary: unknown = '') => {
    lines.push([section, name, value, secondary, tertiary].map(csvEscape).join(','));
  };

  push('meta', 'report_version', report.reportVersion);
  push('meta', 'generated_at', report.generatedAt);
  push('period', 'label', report.period.label);
  push('period', 'from', report.period.from);
  push('period', 'to', report.period.to);
  for (const [name, value] of Object.entries(report.headline.sales)) push('sales', name, value);
  for (const [name, value] of Object.entries(report.headline.commission)) push('commission', name, value);
  for (const [name, value] of Object.entries(report.headline.inventory)) push('inventory', name, value);
  for (const [name, value] of Object.entries(report.headline.aging)) push('aging', name, typeof value === 'object' ? JSON.stringify(value) : value);
  for (const [name, value] of Object.entries(report.headline.recovery)) if (typeof value !== 'object') push('recovery', name, value);

  const mix = report.headline.paymentMix;
  if (mix.current) {
    for (const [type, value] of Object.entries(mix.current)) {
      if (type === 'other' || typeof value !== 'object' || value === null) continue;
      const item = value as Record<string, unknown>;
      push('payment_mix', type, item.revenue, item.transactions, item.units);
    }
  }
  push('payment_mix', 'cash_revenue_share_pct', mix.cashRevenueSharePct);
  push('payment_mix', 'loan_revenue_share_pct', mix.loanRevenueSharePct);

  for (const row of report.comparison.rows) push('comparison', String(row.name ?? row.id ?? 'Entity'), row.revenue, row.units, row.sellThroughProxyPct);
  for (const row of report.trend) push('trend', String(row.bucket ?? ''), row.revenue, row.units, row.transactions);
  for (const row of report.products) push('product', String(row.sku ?? row.variantId ?? 'Variant'), row.revenue, row.units, row.sellThroughProxyPct);
  for (const row of report.recovery.officers) push('recovery_officer', String(row.displayName ?? row.userId ?? 'Officer'), row.recovered, row.closed, row.avgRecoveryDays);
  for (const row of report.insights) push('insight', String(row.code ?? ''), row.detail, row.severity, row.title);

  return {
    filename: `amaal-operational-report-${input.period.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
    csv: `${lines.join('\n')}\n`,
  };
}
