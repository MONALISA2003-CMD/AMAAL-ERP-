export interface RequestContext {
  requestId: string;
  userId: string;
  sessionId: string;
  roles: readonly string[];
}

export interface SaleCommand {
  sellerUserId: string;
  customerId: string;
  imeiId: string;
  paymentType: 'CASH' | 'LOAN';
  expectedUnitPrice: number;
  externalPaymentReference?: string;
}

export interface SaleResult {
  saleId: string;
  saleNumber: string;
  receiptId: string;
  imeiId: string;
  status: 'COMPLETED';
}

export interface SaleTransactionService {
  completeSale(context: RequestContext, command: SaleCommand): Promise<SaleResult>;
}
