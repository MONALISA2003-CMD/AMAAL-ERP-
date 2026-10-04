import type { DatabaseTransaction } from '@amaal/database';
import { assertNonEmpty, assertPositiveMoney, type SaleState } from '@amaal/business-rules';

export type SaleLineCommand = {
  imeiId: string;
  productVariantId: string;
  unitPrice: number;
  discountAmount?: number;
};

export type CreateSaleCommand = {
  sellerUserId: string;
  customerId: string;
  paymentType: 'CASH' | 'LOAN';
  lines: readonly SaleLineCommand[];
  requestedState?: SaleState;
  paymentMethod?: string;
  externalPaymentReference?: string;
  loanProviderId?: string;
  loanReference?: string;
  depositAmount?: number;
  financedAmount?: number;
  dueAt?: string;
  approvalId?: string;
};

export type SaleService = {
  createSale(tx: DatabaseTransaction, command: CreateSaleCommand): Promise<{ saleId: string }>;
};

export function validateCreateSale(command: CreateSaleCommand): void {
  assertNonEmpty(command.sellerUserId, 'sellerUserId');
  assertNonEmpty(command.customerId, 'customerId');
  if (!command.lines.length || command.lines.length > 20) throw new Error('A sale must contain between 1 and 20 IMEI lines.');
  const imeis = new Set<string>();
  for (const line of command.lines) {
    assertNonEmpty(line.imeiId, 'imeiId');
    assertNonEmpty(line.productVariantId, 'productVariantId');
    assertPositiveMoney(line.unitPrice);
    if (line.discountAmount !== undefined && (!Number.isFinite(line.discountAmount) || line.discountAmount < 0)) throw new Error('discountAmount must be a non-negative number.');
    if (imeis.has(line.imeiId)) throw new Error(`IMEI ${line.imeiId} appears more than once in the sale.`);
    imeis.add(line.imeiId);
  }
  if (command.paymentType === 'LOAN') {
    assertNonEmpty(command.loanProviderId ?? '', 'loanProviderId');
    assertNonEmpty(command.loanReference ?? '', 'loanReference');
  }
}

export { PostgresSaleService } from './service.ts';

export { PostgresSaleReadService } from './read-service.ts';
export type { SalesListOptions } from './read-service.ts';
