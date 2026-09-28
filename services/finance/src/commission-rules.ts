export type CommissionRuleDefinition = {
  calculation_type: 'FIXED_AMOUNT' | 'PERCENT_OF_SALE';
  amount?: number;
  rate?: number;
};

export function calculateCommissionAmount(rule: CommissionRuleDefinition, saleAmount: number): number {
  if (!Number.isFinite(saleAmount) || saleAmount < 0) throw new RangeError('saleAmount must be a non-negative number.');
  if (rule.calculation_type === 'FIXED_AMOUNT') return Number((rule.amount ?? 0).toFixed(2));
  if (rule.calculation_type === 'PERCENT_OF_SALE') return Number((saleAmount * ((rule.rate ?? 0) / 100)).toFixed(2));
  throw new RangeError(`Unsupported commission calculation_type: ${String(rule.calculation_type)}`);
}
