import type { DatabaseTransaction } from '@amaal/database';
import { assertPositiveMoney, assertNonEmpty, type SaleState } from '@amaal/business-rules';

export type SaleLineCommand = {
  imeiId: string;
  productVariantId: string;
  unitPrice: number;
};

export type CreateSaleCommand = {
  sellerUserId: string;
  customerId: string;
  paymentType: 'CASH' | 'LOAN';
  lines: readonly SaleLineCommand[];
  requestedState?: SaleState;
  externalPaymentReference?: string;
};

export type SaleService = {
  createSale(tx: DatabaseTransaction, command: CreateSaleCommand): Promise<{ saleId: string }>;
};

export function validateCreateSale(command: CreateSaleCommand): void {
  assertNonEmpty(command.sellerUserId, 'sellerUserId');
  assertNonEmpty(command.customerId, 'customerId');
  if (!command.lines.length) throw new Error('At least one sale line is required.');
  for (const line of command.lines) {
    assertNonEmpty(line.imeiId, 'imeiId');
    assertNonEmpty(line.productVariantId, 'productVariantId');
    assertPositiveMoney(line.unitPrice);
  }
}

export { PostgresSaleService } from './service.js';
