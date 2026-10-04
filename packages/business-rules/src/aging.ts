export type AgingBand = 'GREEN' | 'ORANGE' | 'RED' | 'PURPLE';

export interface AgingBandConfig {
  green: { minDays: number; maxDays: number | null };
  orange: { minDays: number; maxDays: number | null };
  red: { minDays: number; maxDays: number | null };
  purple: { minDays: number; maxDays: number | null };
}

export interface SuspensionConfig {
  agentCriticalDays: number;
  agentAgedDeviceThreshold: number;
  teamLeaderAgedAgentThreshold: number;
  managerAgedTeamThreshold: number;
  teamAgedDeviceThreshold: number;
}

export const DEFAULT_AGING_BANDS: AgingBandConfig = {
  green: { minDays: 1, maxDays: 7 },
  orange: { minDays: 8, maxDays: 13 },
  red: { minDays: 14, maxDays: 17 },
  purple: { minDays: 18, maxDays: null },
};

export const DEFAULT_SUSPENSION_CONFIG: SuspensionConfig = {
  agentCriticalDays: 18,
  agentAgedDeviceThreshold: 4,
  teamLeaderAgedAgentThreshold: 4,
  managerAgedTeamThreshold: 4,
  teamAgedDeviceThreshold: 4,
};

function requireInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer.`);
}

export function normalizeAgingBands(config?: Partial<AgingBandConfig>): AgingBandConfig {
  const merged: AgingBandConfig = {
    green: { ...DEFAULT_AGING_BANDS.green, ...(config?.green ?? {}) },
    orange: { ...DEFAULT_AGING_BANDS.orange, ...(config?.orange ?? {}) },
    red: { ...DEFAULT_AGING_BANDS.red, ...(config?.red ?? {}) },
    purple: { ...DEFAULT_AGING_BANDS.purple, ...(config?.purple ?? {}) },
  };
  const entries = Object.entries(merged) as Array<[AgingBand, { minDays: number; maxDays: number | null }]>;
  for (const [band, range] of entries) {
    requireInteger(range.minDays, `${band}.minDays`);
    if (range.maxDays !== null) requireInteger(range.maxDays, `${band}.maxDays`);
    if (range.maxDays !== null && range.maxDays < range.minDays) throw new Error(`${band}.maxDays must be >= minDays.`);
  }
  const ordered = entries.sort((a, b) => a[1].minDays - b[1].minDays);
  if (ordered[0]?.[1].minDays !== 1) throw new Error('Aging bands must begin at day 1.');
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1]![1];
    const current = ordered[i]![1];
    if (prev.maxDays === null || current.minDays !== prev.maxDays + 1) throw new Error('Aging bands must be contiguous and non-overlapping.');
  }
  if (ordered.at(-1)?.[1].maxDays !== null) throw new Error('Final aging band must be open-ended.');
  return merged;
}

export function resolveAgingBand(days: number, config?: Partial<AgingBandConfig>): AgingBand {
  if (!Number.isInteger(days) || days < 1) throw new Error('Aging days must be a positive integer.');
  const bands = normalizeAgingBands(config);
  for (const band of ['GREEN', 'ORANGE', 'RED', 'PURPLE'] as const) {
    const range = bands[band.toLowerCase() as keyof AgingBandConfig];
    if (days >= range.minDays && (range.maxDays === null || days <= range.maxDays)) return band;
  }
  throw new Error(`No aging band configured for day ${days}.`);
}

export function deriveAgingFlags(days: number, warningDays: number, maximumDays: number, criticalOverdueDays: number): {
  isWarning: boolean; isOverdue: boolean; isCritical: boolean; daysRemaining: number; daysOverdue: number;
} {
  if (!Number.isInteger(days) || days < 0) throw new Error('days must be a non-negative integer.');
  if (!Number.isInteger(warningDays) || warningDays < 0) throw new Error('warningDays must be a non-negative integer.');
  if (!Number.isInteger(maximumDays) || maximumDays <= 0) throw new Error('maximumDays must be positive.');
  if (!Number.isInteger(criticalOverdueDays) || criticalOverdueDays < 0) throw new Error('criticalOverdueDays must be a non-negative integer.');
  return {
    isWarning: days >= warningDays,
    isOverdue: days >= maximumDays,
    isCritical: days >= maximumDays + criticalOverdueDays,
    daysRemaining: Math.max(0, maximumDays - days),
    daysOverdue: Math.max(0, days - maximumDays),
  };
}

export function qualifiesForAgentSuspension(criticalDeviceCount: number, oldestCriticalAgeDays: number, cfg: SuspensionConfig): boolean {
  return criticalDeviceCount >= cfg.agentAgedDeviceThreshold && oldestCriticalAgeDays >= cfg.agentCriticalDays;
}

export function qualifiesForTeamLeaderSuspension(criticalAgedAgentCount: number, criticalDeviceCount: number, cfg: SuspensionConfig): boolean {
  return criticalAgedAgentCount >= cfg.teamLeaderAgedAgentThreshold || criticalDeviceCount >= cfg.teamAgedDeviceThreshold;
}

export function qualifiesForManagerSuspension(agedTeamCount: number, cfg: SuspensionConfig): boolean {
  return agedTeamCount >= cfg.managerAgedTeamThreshold;
}
