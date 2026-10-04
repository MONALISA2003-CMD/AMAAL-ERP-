export type Phase4PaymentType = 'CASH' | 'LOAN';

export type PolicyConditions = Record<string, unknown>;

export function validateSalePaymentContract(input: {
  paymentType: Phase4PaymentType;
  totalAmount: number;
  depositAmount: number;
  financedAmount: number;
  loanProviderId?: string | null;
  loanReference?: string | null;
}): void {
  if (!Number.isFinite(input.totalAmount) || input.totalAmount <= 0) throw new Error('Sale total must be positive.');
  if (!Number.isFinite(input.depositAmount) || input.depositAmount < 0) throw new Error('Deposit amount must be non-negative.');
  if (!Number.isFinite(input.financedAmount) || input.financedAmount < 0) throw new Error('Financed amount must be non-negative.');
  if (input.paymentType === 'CASH') {
    if (Math.abs(input.depositAmount - input.totalAmount) > 0.005 || Math.abs(input.financedAmount) > 0.005) throw new Error('CASH sale must be fully paid and cannot have financed amount.');
    if (input.loanProviderId || input.loanReference) throw new Error('CASH sale cannot have loan provider/reference.');
    return;
  }
  if (!input.loanProviderId || !input.loanReference?.trim()) throw new Error('LOAN sale requires loan provider and loan reference.');
  if (input.financedAmount <= 0) throw new Error('LOAN sale requires a positive financed amount.');
  if (Math.abs(input.depositAmount + input.financedAmount - input.totalAmount) > 0.005) throw new Error('Loan deposit plus financed amount must equal the sale total.');
}

export function saleLineAmountsAreValid(input: { listPrice: number; discountAmount: number; finalPrice: number; minimumPrice?: number; discountLimit?: number }): void {
  if (!Number.isFinite(input.listPrice) || input.listPrice < 0) throw new Error('List price is invalid.');
  if (!Number.isFinite(input.discountAmount) || input.discountAmount < 0) throw new Error('Discount is invalid.');
  if (!Number.isFinite(input.finalPrice) || input.finalPrice < 0) throw new Error('Final price is invalid.');
  if (Math.abs(input.listPrice - input.discountAmount - input.finalPrice) > 0.005) throw new Error('Final price must equal list price minus discount.');
  if (input.minimumPrice !== undefined && input.finalPrice + 0.005 < input.minimumPrice) throw new Error('Final price is below the policy minimum.');
  if (input.discountLimit !== undefined && input.discountAmount > input.discountLimit + 0.005) throw new Error('Discount exceeds the policy limit.');
}

export function policyConditionsMatch(input: { conditions?: PolicyConditions | null; saleAmount: number; paymentType?: Phase4PaymentType }): boolean {
  const c = input.conditions ?? {};
  const minSale = c.minSaleAmount !== undefined ? Number(c.minSaleAmount) : null;
  const maxSale = c.maxSaleAmount !== undefined ? Number(c.maxSaleAmount) : null;
  const paymentTypes = Array.isArray(c.paymentTypes) ? c.paymentTypes.filter((v): v is string => typeof v === 'string') : null;
  if (minSale !== null && (!Number.isFinite(minSale) || input.saleAmount < minSale)) return false;
  if (maxSale !== null && (!Number.isFinite(maxSale) || input.saleAmount > maxSale)) return false;
  if (paymentTypes && (!input.paymentType || !paymentTypes.includes(input.paymentType))) return false;
  return true;
}
