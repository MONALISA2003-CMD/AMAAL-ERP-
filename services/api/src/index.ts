import { createPool, healthcheck, PgTransactionManager } from '@amaal/database';
import { PostgresSaleService } from '@amaal/sales';
import { PostgresInventoryService } from '@amaal/inventory';
import { PostgresFinanceService } from '@amaal/finance';
import { PostgresApprovalService } from '@amaal/approvals';
import { PostgresRecoveryService } from '@amaal/recovery';
import type { CreateSaleCommand } from '@amaal/sales';
import type { AllocationRequest } from '@amaal/inventory';
import type { CreateRecoveryCaseInput, AssignRecoveryCaseInput, RecoveryActivityInput, AcceptRecoveredStockInput } from '@amaal/recovery';
import { withIdempotency } from './idempotency.ts';

export type ApiServices = {
  transactions: PgTransactionManager;
  sales: PostgresSaleService;
  inventory: PostgresInventoryService;
  finance: PostgresFinanceService;
  approvals: PostgresApprovalService;
  recovery: PostgresRecoveryService;
  pool: ReturnType<typeof createPool>;
};

export function createApiServices(): ApiServices {
  const pool = createPool();
  return {
    pool,
    transactions:new PgTransactionManager(pool),
    sales:new PostgresSaleService(),
    inventory:new PostgresInventoryService(),
    finance:new PostgresFinanceService(),
    approvals:new PostgresApprovalService(),
    recovery:new PostgresRecoveryService(),
  };
}

export function checkDatabaseReadiness(services:ApiServices): Promise<boolean> {
  return healthcheck(services.pool);
}

export function completeCashSale(services:ApiServices,requestId:string,actorUserId:string,command:CreateSaleCommand,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'sales.cash.create',idempotencyKey,command,(tx)=>services.sales.createAndCompleteSale(tx,actorUserId,command));
}

export function requestInventoryAllocation(services:ApiServices,requestId:string,actorUserId:string,command:AllocationRequest,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'inventory.allocation.request',idempotencyKey,command,(tx)=>services.inventory.requestAllocation(tx,actorUserId,command));
}

export function approveInventoryAllocation(services:ApiServices,requestId:string,actorUserId:string,allocationId:string,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'inventory.allocation.approve',idempotencyKey,{allocationId},(tx)=>services.inventory.approveAllocation(tx,actorUserId,allocationId));
}

export function cancelInventoryAllocation(services:ApiServices,requestId:string,actorUserId:string,allocationId:string,mode:'CANCELLED'|'REJECTED',reason:string,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,`inventory.allocation.${mode.toLowerCase()}`,idempotencyKey,{allocationId,mode,reason},(tx)=>services.inventory.cancelAllocation(tx,actorUserId,allocationId,mode,reason));
}

export function dispatchInventoryAllocation(services:ApiServices,requestId:string,actorUserId:string,allocationId:string,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'inventory.allocation.dispatch',idempotencyKey,{allocationId},(tx)=>services.inventory.dispatchAllocation(tx,actorUserId,allocationId));
}

export function receiveInventoryAllocation(services:ApiServices,requestId:string,actorUserId:string,allocationId:string,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'inventory.allocation.receive',idempotencyKey,{allocationId},(tx)=>services.inventory.receiveAllocation(tx,actorUserId,allocationId));
}

export function returnInventoryToWarehouse(services:ApiServices,requestId:string,actorUserId:string,input:Parameters<PostgresInventoryService['returnToWarehouse']>[2],idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'inventory.return',idempotencyKey,input,(tx)=>services.inventory.returnToWarehouse(tx,actorUserId,input));
}

export function executeApprovedInventoryCorrection(services:ApiServices,requestId:string,actorUserId:string,input:Parameters<PostgresInventoryService['executeApprovedCorrection']>[2],idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,`inventory.correction.${input.movementType ?? 'ADJUSTMENT'}`,idempotencyKey,input,(tx)=>services.inventory.executeApprovedCorrection(tx,actorUserId,input));
}

export function reverseSale(services:ApiServices,requestId:string,actorUserId:string,saleId:string,reason:string,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'sales.reverse',idempotencyKey,{saleId,reason},(tx)=>services.finance.reverseSale(tx,actorUserId,saleId,reason));
}

export function createApprovalRequest(services:ApiServices,requestId:string,actorUserId:string,input:Parameters<PostgresApprovalService['createRequest']>[2],idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'approvals.create',idempotencyKey,input,(tx)=>services.approvals.createRequest(tx,actorUserId,input));
}


export function createRecoveryCase(services:ApiServices,requestId:string,actorUserId:string,input:CreateRecoveryCaseInput,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'recovery.case.create',idempotencyKey,input,(tx)=>services.recovery.createCase(tx,actorUserId,input));
}

export function assignRecoveryCase(services:ApiServices,requestId:string,actorUserId:string,input:AssignRecoveryCaseInput,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'recovery.case.assign',idempotencyKey,input,(tx)=>services.recovery.assignCase(tx,actorUserId,input));
}

export function addRecoveryActivity(services:ApiServices,requestId:string,actorUserId:string,input:RecoveryActivityInput,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'recovery.activity.create',idempotencyKey,input,(tx)=>services.recovery.addActivity(tx,actorUserId,input));
}

export function acceptRecoveredStock(services:ApiServices,requestId:string,actorUserId:string,input:AcceptRecoveredStockInput,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'recovery.stock.accept',idempotencyKey,input,(tx)=>services.recovery.acceptRecoveredStock(tx,actorUserId,input));
}

export function closeRecoveryCase(services:ApiServices,requestId:string,actorUserId:string,caseId:string,reason:string,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'recovery.case.close',idempotencyKey,{caseId,reason},(tx)=>services.recovery.closeCase(tx,actorUserId,caseId,reason));
}

export function decideApproval(services:ApiServices,requestId:string,actorUserId:string,approvalId:string,decision:'APPROVED'|'REJECTED',reason:string,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'approvals.decision',idempotencyKey,{approvalId,decision,reason},(tx)=>services.approvals.decide(tx,actorUserId,approvalId,decision,reason));
}

export { withIdempotency } from './idempotency.ts';
export { createApiServer } from './http.ts';
