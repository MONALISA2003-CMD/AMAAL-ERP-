export type ReportPeriod = 'TODAY' | 'WEEK' | 'MONTH' | '3M' | '6M' | '12M';
export type ReportBucket = 'DAY' | 'MONTH';
export type PeriodWindow = {
  period: ReportPeriod;
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  label: string;
  bucket: ReportBucket;
};

export type AgeBand = { minDays: number; maxDays: number | null };
export type AgeBands = Record<'green' | 'orange' | 'red' | 'purple', AgeBand>;

export function periodWindow(period: ReportPeriod, now = new Date()): PeriodWindow {
  const utc = new Date(now.toISOString());
  const today = new Date(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate()));
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const iso = (value: Date) => value.toISOString();
  const previousSameLength = (from: Date, to: Date): [Date, Date] => {
    const span = to.getTime() - from.getTime();
    return [new Date(from.getTime() - span), new Date(from.getTime())];
  };

  if (period === 'TODAY') {
    const [previousFrom, previousTo] = previousSameLength(today, tomorrow);
    return { period, from: iso(today), to: iso(tomorrow), previousFrom: iso(previousFrom), previousTo: iso(previousTo), label: 'Today', bucket: 'DAY' };
  }

  if (period === 'WEEK') {
    const weekStart = new Date(today);
    const mondayOffset = (today.getUTCDay() + 6) % 7;
    weekStart.setUTCDate(weekStart.getUTCDate() - mondayOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const [previousFrom, previousTo] = previousSameLength(weekStart, weekEnd);
    return { period, from: iso(weekStart), to: iso(weekEnd), previousFrom: iso(previousFrom), previousTo: iso(previousTo), label: 'This Week', bucket: 'DAY' };
  }

  if (period === 'MONTH') {
    const [previousFrom, previousTo] = previousSameLength(monthStart, nextMonth);
    return { period, from: iso(monthStart), to: iso(nextMonth), previousFrom: iso(previousFrom), previousTo: iso(previousTo), label: 'This Month', bucket: 'DAY' };
  }

  const months = period === '3M' ? 3 : period === '6M' ? 6 : 12;
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (months - 1), 1));
  const [previousFrom, previousTo] = previousSameLength(from, nextMonth);
  return {
    period,
    from: iso(from),
    to: iso(nextMonth),
    previousFrom: iso(previousFrom),
    previousTo: iso(previousTo),
    label: period === '3M' ? '3 Months' : period === '6M' ? '6 Months' : '12 Months',
    bucket: 'MONTH',
  };
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function resolveAgeBands(input: {
  warningDays: number;
  maximumDays: number;
  criticalOverdueDays: number;
  configured?: Partial<AgeBands> | null;
}): AgeBands {
  if (input.configured?.green && input.configured?.orange && input.configured?.red && input.configured?.purple) {
    return {
      green: input.configured.green,
      orange: input.configured.orange,
      red: input.configured.red,
      purple: input.configured.purple,
    };
  }

  // Amaal's approved default is 1-7 / 8-13 / 14-17 / 18+.
  // Where a later policy has no explicit band_config, retain this mapping when the
  // policy keeps the approved 18-day maximum; otherwise derive the bands from policy thresholds.
  if (input.maximumDays === 18 && input.warningDays === 8) {
    return {
      green: { minDays: 1, maxDays: 7 },
      orange: { minDays: 8, maxDays: 13 },
      red: { minDays: 14, maxDays: 17 },
      purple: { minDays: 18, maxDays: null },
    };
  }

  const greenMax = Math.max(1, input.warningDays - 1);
  const overdueSplit = Math.max(input.warningDays, input.maximumDays - Math.max(1, Math.ceil((input.maximumDays - input.warningDays) / 2)));
  const orangeMax = Math.max(input.warningDays, overdueSplit - 1);
  return {
    green: { minDays: 1, maxDays: greenMax },
    orange: { minDays: input.warningDays, maxDays: orangeMax },
    red: { minDays: orangeMax + 1, maxDays: Math.max(orangeMax + 1, input.maximumDays - 1) },
    purple: { minDays: input.maximumDays, maxDays: null },
  };
}

export function ageBand(days: number, bands: AgeBands): 'GREEN' | 'ORANGE' | 'RED' | 'PURPLE' | 'UNAGED' {
  const ordered: Array<['GREEN' | 'ORANGE' | 'RED' | 'PURPLE', AgeBand]> = [
    ['GREEN', bands.green],
    ['ORANGE', bands.orange],
    ['RED', bands.red],
    ['PURPLE', bands.purple],
  ];
  if (days < 1) return 'UNAGED';
  for (const [name, range] of ordered) {
    if (days >= range.minDays && (range.maxDays === null || days <= range.maxDays)) return name;
  }
  return 'PURPLE';
}

export function concentration(units: readonly number[]): { totalUnits: number; topSharePct: number; hhi: number } {
  const totalUnits = units.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (totalUnits === 0) return { totalUnits: 0, topSharePct: 0, hhi: 0 };
  const shares = units.map((value) => Math.max(0, value) / totalUnits);
  return {
    totalUnits,
    topSharePct: Math.max(...shares) * 100,
    hhi: shares.reduce((sum, share) => sum + share * share, 0) * 10000,
  };
}

export function clampLimit(value: number | undefined, fallback = 100, maximum = 500): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) throw new Error(`limit must be an integer between 1 and ${maximum}.`);
  return Math.min(value, maximum);
}
