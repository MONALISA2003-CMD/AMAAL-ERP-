export { PostgresFinanceService } from './reversal.ts';
export { createDirectSellerCommission } from './commission.ts';
export type { CommissionOutcome } from './commission.ts';
export type { CommissionRuleDefinition } from './commission-rules.ts';
export { calculateCommissionAmount } from './commission-rules.ts';

export { PostgresFinanceLedgerService, periodBounds } from './ledger.ts';
export type { CommissionPolicyInput, BonusPolicyInput } from './ledger.ts';

export { PostgresPaymentService } from './payments.ts';
export type { PaymentAdjustmentInput } from './payments.ts';
export { PostgresReceiptService } from './receipts.ts';
export { PostgresLoanProviderService } from './loan-providers.ts';
export { policyConditionsMatch, saleLineAmountsAreValid, validateSalePaymentContract } from './phase4-finance-rules.ts';

import { PostgresFinanceLedgerService } from './ledger.ts';
import type { DatabaseTransaction } from '@amaal/database';

export function evaluateBonusesForSale(
  tx: DatabaseTransaction,
  input: Parameters<PostgresFinanceLedgerService['evaluateBonusesForSale']>[1],
) {
  return new PostgresFinanceLedgerService().evaluateBonusesForSale(tx, input);
}
