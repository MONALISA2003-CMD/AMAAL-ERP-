import { createPool, healthcheck, PgTransactionManager } from '@amaal/database';
import { PostgresSaleService, PostgresSaleReadService } from '@amaal/sales';
import { PostgresInventoryService, PostgresInventoryReadService, PostgresInventoryReconciliationService } from '@amaal/inventory';
import { PostgresFinanceService, PostgresFinanceLedgerService, PostgresPaymentService, PostgresReceiptService, PostgresLoanProviderService } from '@amaal/finance';
import { PostgresCustomerService } from '@amaal/customers';
import { PostgresApprovalService } from '@amaal/approvals';
import { PostgresRecoveryGovernanceService, PostgresRecoveryService } from '@amaal/recovery';
import type { CreateSaleCommand } from '@amaal/sales';
import type { AllocationRequest } from '@amaal/inventory';
import { PostgresCatalogService } from '@amaal/catalog';
import type { CreateRecoveryCaseInput, AssignRecoveryCaseInput, RecoveryActivityInput, AcceptRecoveredStockInput } from '@amaal/recovery';
import { withIdempotency } from './idempotency.ts';
import { chatAmaalAI, createConversation, decideAIApproval, executeApprovedRecoveryPlan, getAmaalAIStatus, listAIAwaitingApprovals, listActionPlans, submitActionPlanForApproval } from '@amaal/ai';

export type ApiServices = {
  transactions: PgTransactionManager;
  sales: PostgresSaleService;
  salesRead: PostgresSaleReadService;
  inventory: PostgresInventoryService;
  inventoryRead: PostgresInventoryReadService;
  inventoryReconciliation: PostgresInventoryReconciliationService;
  catalog: PostgresCatalogService;
  finance: PostgresFinanceService;
  financeLedger: PostgresFinanceLedgerService;
  payments: PostgresPaymentService;
  receipts: PostgresReceiptService;
  loanProviders: PostgresLoanProviderService;
  customers: PostgresCustomerService;
  approvals: PostgresApprovalService;
  recovery: PostgresRecoveryService;
  recoveryGovernance: PostgresRecoveryGovernanceService;
  pool: ReturnType<typeof createPool>;
};

export function createApiServices(): ApiServices {
  const pool = createPool();
  return {
    pool,
    transactions:new PgTransactionManager(pool),
    sales:new PostgresSaleService(),
    salesRead:new PostgresSaleReadService(),
    inventory:new PostgresInventoryService(),
    inventoryRead:new PostgresInventoryReadService(),
    inventoryReconciliation:new PostgresInventoryReconciliationService(),
    catalog:new PostgresCatalogService(),
    finance:new PostgresFinanceService(),
    financeLedger:new PostgresFinanceLedgerService(),
    payments:new PostgresPaymentService(),
    receipts:new PostgresReceiptService(),
    loanProviders:new PostgresLoanProviderService(),
    customers:new PostgresCustomerService(),
    approvals:new PostgresApprovalService(),
    recovery:new PostgresRecoveryService(),
    recoveryGovernance:new PostgresRecoveryGovernanceService(),
  };
}



export function listCustomers(services:ApiServices,requestId:string,actorUserId:string,query?:string,limit?:number) {
  return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.customers.list(tx,actorUserId,query??'',limit??100));
}
export function getCustomer(services:ApiServices,requestId:string,actorUserId:string,customerId:string) {
  return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.customers.get(tx,actorUserId,customerId));
}
export function createCustomer(services:ApiServices,requestId:string,actorUserId:string,input:Parameters<PostgresCustomerService['create']>[2],idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'customers.create',idempotencyKey,input,(tx)=>services.customers.create(tx,actorUserId,input));
}
export function updateCustomer(services:ApiServices,requestId:string,actorUserId:string,customerId:string,input:Parameters<PostgresCustomerService['update']>[3],idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'customers.update',idempotencyKey,{customerId,input},(tx)=>services.customers.update(tx,actorUserId,customerId,input));
}
export function assignCustomer(services:ApiServices,requestId:string,actorUserId:string,customerId:string,newOwnerUserId:string,reason:string,idempotencyKey?:string) { return withIdempotency(services,requestId,actorUserId,'customers.assign',idempotencyKey,{customerId,newOwnerUserId,reason},(tx)=>services.customers.assign(tx,actorUserId,customerId,newOwnerUserId,reason)); }
export function listSales(services:ApiServices,requestId:string,actorUserId:string,options:Parameters<PostgresSaleReadService['list']>[2] = {}) {
  return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.salesRead.list(tx,actorUserId,options));
}
export function getSale(services:ApiServices,requestId:string,actorUserId:string,saleId:string) {
  return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.salesRead.get(tx,actorUserId,saleId));
}
export function listSalePayments(services:ApiServices,requestId:string,actorUserId:string,saleId:string) {
  return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.salesRead.listPayments(tx,actorUserId,saleId));
}
export function listCommissions(services:ApiServices,requestId:string,actorUserId:string,options:Parameters<PostgresFinanceLedgerService['listCommissions']>[2] = {}) {
  return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.financeLedger.listCommissions(tx,actorUserId,options));
}
export function listBonuses(services:ApiServices,requestId:string,actorUserId:string,limit?:number) {
  return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.financeLedger.listBonuses(tx,actorUserId,limit));
}
export function listReceipts(services:ApiServices,requestId:string,actorUserId:string,limit?:number) { return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.receipts.list(tx,actorUserId,limit)); }
export function getReceipt(services:ApiServices,requestId:string,actorUserId:string,receiptId:string) { return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.receipts.get(tx,actorUserId,receiptId)); }
export function listLoanProviders(services:ApiServices,requestId:string,actorUserId:string) { return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.loanProviders.list(tx,actorUserId)); }
export function createLoanProvider(services:ApiServices,requestId:string,actorUserId:string,input:Parameters<PostgresLoanProviderService['create']>[2],idempotencyKey?:string) { return withIdempotency(services,requestId,actorUserId,'finance.loan-provider.create',idempotencyKey,input,(tx)=>services.loanProviders.create(tx,actorUserId,input)); }
export function archiveLoanProvider(services:ApiServices,requestId:string,actorUserId:string,providerId:string,idempotencyKey?:string) { return withIdempotency(services,requestId,actorUserId,'finance.loan-provider.archive',idempotencyKey,{providerId},(tx)=>services.loanProviders.archive(tx,actorUserId,providerId)); }
export function adjustPayment(services:ApiServices,requestId:string,actorUserId:string,input:Parameters<PostgresPaymentService['adjust']>[2],idempotencyKey?:string) { return withIdempotency(services,requestId,actorUserId,'finance.payment.adjust',idempotencyKey,input,(tx)=>services.payments.adjust(tx,actorUserId,input)); }
export function listPaymentAdjustments(services:ApiServices,requestId:string,actorUserId:string,paymentId?:string,limit?:number) { return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.payments.listAdjustments(tx,actorUserId,paymentId,limit??100)); }
export function createCommissionPolicy(services:ApiServices,requestId:string,actorUserId:string,input:Parameters<PostgresFinanceLedgerService['createCommissionPolicy']>[2],idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'finance.commission-policy.create',idempotencyKey,input,(tx)=>services.financeLedger.createCommissionPolicy(tx,actorUserId,input));
}
export function createBonusPolicy(services:ApiServices,requestId:string,actorUserId:string,input:Parameters<PostgresFinanceLedgerService['createBonusPolicy']>[2],idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'finance.bonus-policy.create',idempotencyKey,input,(tx)=>services.financeLedger.createBonusPolicy(tx,actorUserId,input));
}

export function getInventorySummary(services:ApiServices,requestId:string,actorUserId:string) {
  return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.inventoryRead.getSummary(tx,actorUserId));
}

export function searchInventoryImeis(services:ApiServices,requestId:string,actorUserId:string,options:Parameters<PostgresInventoryReadService['searchImeis']>[2]) {
  return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.inventoryRead.searchImeis(tx,actorUserId,options));
}

export function listInventoryAllocations(services:ApiServices,requestId:string,actorUserId:string,limit?:number) {
  return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.inventoryRead.listAllocations(tx,actorUserId,limit));
}

export function listInventoryMovements(services:ApiServices,requestId:string,actorUserId:string,imeiId:string,limit?:number) {
  return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.inventoryRead.listMovements(tx,actorUserId,imeiId,limit));
}

export function listInventoryReconciliations(services:ApiServices,requestId:string,actorUserId:string,limit?:number) {
  return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.inventoryReconciliation.listRuns(tx,actorUserId,limit));
}

export function createInventoryReconciliation(services:ApiServices,requestId:string,actorUserId:string,scope:Parameters<PostgresInventoryReconciliationService['createRun']>[2],notes?:string,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'inventory.reconciliation.create',idempotencyKey,{scope,notes},(tx)=>services.inventoryReconciliation.createRun(tx,actorUserId,scope,notes));
}

export function addInventoryReconciliationScans(services:ApiServices,requestId:string,actorUserId:string,reconciliationId:string,scans:Parameters<PostgresInventoryReconciliationService['addScans']>[3],idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'inventory.reconciliation.scan',idempotencyKey,{reconciliationId,scans},(tx)=>services.inventoryReconciliation.addScans(tx,actorUserId,reconciliationId,scans));
}

export function finalizeInventoryReconciliation(services:ApiServices,requestId:string,actorUserId:string,reconciliationId:string,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'inventory.reconciliation.finalize',idempotencyKey,{reconciliationId},(tx)=>services.inventoryReconciliation.finalizeRun(tx,actorUserId,reconciliationId));
}


export function listPricePolicies(services:ApiServices,requestId:string,actorUserId:string,productVariantId?:string) {
  return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.catalog.listPricePolicies(tx,actorUserId,productVariantId));
}
export function createPricePolicy(services:ApiServices,requestId:string,actorUserId:string,input:Parameters<PostgresCatalogService['createPricePolicy']>[2],idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'catalog.price-policy.create',idempotencyKey,input,(tx)=>services.catalog.createPricePolicy(tx,actorUserId,input));
}

export function listCatalogBrands(services:ApiServices,requestId:string,actorUserId:string) {
  return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.catalog.listBrands(tx,actorUserId));
}

export function listCatalogProducts(services:ApiServices,requestId:string,actorUserId:string,query?:string) {
  return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.catalog.listProducts(tx,actorUserId,query));
}

export function listInventoryWarehouses(services:ApiServices,requestId:string,actorUserId:string) {
  return services.transactions.withTransaction({requestId,actorUserId},(tx)=>services.catalog.listWarehouses(tx,actorUserId));
}

export function createCatalogBrand(services:ApiServices,requestId:string,actorUserId:string,input:Parameters<PostgresCatalogService['createBrand']>[2],idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'catalog.brand.create',idempotencyKey,input,(tx)=>services.catalog.createBrand(tx,actorUserId,input));
}

export function createCatalogProduct(services:ApiServices,requestId:string,actorUserId:string,input:Parameters<PostgresCatalogService['createProduct']>[2],idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'catalog.product.create',idempotencyKey,input,(tx)=>services.catalog.createProduct(tx,actorUserId,input));
}
export function updateCatalogBrand(services:ApiServices,requestId:string,actorUserId:string,brandId:string,input:Parameters<PostgresCatalogService['updateBrand']>[3],idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'catalog.brand.update',idempotencyKey,{brandId,input},(tx)=>services.catalog.updateBrand(tx,actorUserId,brandId,input));
}
export function archiveCatalogBrand(services:ApiServices,requestId:string,actorUserId:string,brandId:string,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'catalog.brand.archive',idempotencyKey,{brandId},(tx)=>services.catalog.archiveBrand(tx,actorUserId,brandId));
}

export function updateCatalogProduct(services:ApiServices,requestId:string,actorUserId:string,productId:string,input:Parameters<PostgresCatalogService['updateProduct']>[3],idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'catalog.product.update',idempotencyKey,{productId,input},(tx)=>services.catalog.updateProduct(tx,actorUserId,productId,input));
}
export function archiveCatalogProduct(services:ApiServices,requestId:string,actorUserId:string,productId:string,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'catalog.product.archive',idempotencyKey,{productId},(tx)=>services.catalog.archiveProduct(tx,actorUserId,productId));
}

export function createCatalogVariant(services:ApiServices,requestId:string,actorUserId:string,input:Parameters<PostgresCatalogService['createVariant']>[2],idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'catalog.variant.create',idempotencyKey,input,(tx)=>services.catalog.createVariant(tx,actorUserId,input));
}

export function receiveCatalogImeis(services:ApiServices,requestId:string,actorUserId:string,input:Parameters<PostgresCatalogService['receiveImeis']>[2],idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'inventory.receipt.create',idempotencyKey,input,(tx)=>services.catalog.receiveImeis(tx,actorUserId,input));
}
export function updateCatalogVariant(services:ApiServices,requestId:string,actorUserId:string,variantId:string,input:Parameters<PostgresCatalogService['updateVariant']>[3],idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'catalog.variant.update',idempotencyKey,{variantId,input},(tx)=>services.catalog.updateVariant(tx,actorUserId,variantId,input));
}
export function archiveCatalogVariant(services:ApiServices,requestId:string,actorUserId:string,variantId:string,idempotencyKey?:string) {
  return withIdempotency(services,requestId,actorUserId,'catalog.variant.archive',idempotencyKey,{variantId},(tx)=>services.catalog.archiveVariant(tx,actorUserId,variantId));
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

export { getOperationalReport, parseReportPeriod, parseComparison } from './reporting.ts';
export { getOperationalReportCsv } from './reporting-export.ts';
export { withIdempotency } from './idempotency.ts';
export { createApiServer } from './http.ts';

export { getAmaalSetupStatus, initializeAmaalOrganization, validateSetupInitializeInput } from './setup.ts';

export { getOrganizationDirectory, createRegion, createSubregion, createTeam, createShop, provisionPerson, provisionAdmin, createOrganizationInvitation, createAdminInvitation, getOrganizationInvitationPreview, acceptOrganizationInvitation } from './organization.ts';


export function listAgingPolicies(services:ApiServices,requestId:string,actorUserId:string) { return services.transactions.withTransaction({requestId,actorUserId},tx=>services.recoveryGovernance.listAgingPolicies(tx,actorUserId)); }
export function createAgingPolicy(services:ApiServices,requestId:string,actorUserId:string,input:Parameters<PostgresRecoveryGovernanceService['createAgingPolicy']>[2],idempotencyKey?:string) { return withIdempotency(services,requestId,actorUserId,'aging.policy.create',idempotencyKey,input,(tx)=>services.recoveryGovernance.createAgingPolicy(tx,actorUserId,input)); }

export function listAgingQueue(services:ApiServices,requestId:string,actorUserId:string,options:Parameters<PostgresRecoveryGovernanceService['listAgingQueue']>[2]={}) { return services.transactions.withTransaction({requestId,actorUserId},tx=>services.recoveryGovernance.listAgingQueue(tx,actorUserId,options)); }
export function listRecoveryQueue(services:ApiServices,requestId:string,actorUserId:string,limit?:number) { return services.transactions.withTransaction({requestId,actorUserId},tx=>services.recoveryGovernance.listRecoveryQueue(tx,actorUserId,limit)); }
export function getRecoveryCase(services:ApiServices,requestId:string,actorUserId:string,caseId:string) { return services.transactions.withTransaction({requestId,actorUserId},tx=>services.recoveryGovernance.getRecoveryCase(tx,actorUserId,caseId)); }
export function listRecoverySuspensions(services:ApiServices,requestId:string,actorUserId:string,activeOnly=true,limit?:number) { return services.transactions.withTransaction({requestId,actorUserId},tx=>services.recoveryGovernance.listSuspensions(tx,actorUserId,activeOnly,limit??100)); }
export function reassignRecoveryCase(services:ApiServices,requestId:string,actorUserId:string,caseId:string,officerUserId:string,reason:string,idempotencyKey?:string) { return withIdempotency(services,requestId,actorUserId,'recovery.case.reassign',idempotencyKey,{caseId,officerUserId,reason},tx=>services.recoveryGovernance.reassignCase(tx,actorUserId,caseId,officerUserId,reason)); }
export function reinstateSuspendedUser(services:ApiServices,requestId:string,actorUserId:string,userId:string,reason:string,idempotencyKey?:string) { return withIdempotency(services,requestId,actorUserId,'recovery.user.reinstate',idempotencyKey,{userId,reason},tx=>services.recoveryGovernance.reinstateUser(tx,actorUserId,userId,reason)); }


export function getAIStatus(services:ApiServices,requestId:string,actorUserId:string) {
  return services.transactions.withTransaction({requestId,actorUserId}, async (tx) => {
    const result = await tx.query<{ai_use:boolean}>(`select private.user_has_permission('ai.use') as ai_use`);
    if (!result[0]?.ai_use) throw new Error('Amaal AI is not enabled for this user.');
    return getAmaalAIStatus();
  });
}
export function chatAI(services:ApiServices,requestId:string,actorUserId:string,input:{message:string;conversationId?:string}) {
  return chatAmaalAI(services.transactions,{userId:actorUserId,requestId,...input});
}
export function createAIConversation(services:ApiServices,requestId:string,actorUserId:string,input:{title?:string}) {
  return createConversation(services.transactions,requestId,actorUserId,{title:input.title,provider:getAmaalAIStatus().configured?'openai':undefined,model:getAmaalAIStatus().model ?? undefined,autonomyLevel:1});
}
export function listAIActionPlans(services:ApiServices,requestId:string,actorUserId:string) { return listActionPlans(services.transactions,requestId,actorUserId); }
export function listAIAwaitingApprovalRequests(services:ApiServices,requestId:string,actorUserId:string) { return listAIAwaitingApprovals(services.transactions,requestId,actorUserId); }
export function submitAIActionPlan(services:ApiServices,requestId:string,actorUserId:string,planId:string,reason:string) { return submitActionPlanForApproval(services.transactions,requestId,actorUserId,planId,reason); }
export function decideAIAwaitingApproval(services:ApiServices,requestId:string,actorUserId:string,approvalId:string,decision:'APPROVED'|'REJECTED',reason:string,idempotencyKey?:string) { return withIdempotency(services,requestId,actorUserId,'ai.approval.decision',idempotencyKey,{approvalId,decision,reason},(tx)=>decideAIApproval(services.transactions,requestId,actorUserId,approvalId,decision,reason)); }
export function executeAIRecoveryPlan(services:ApiServices,requestId:string,actorUserId:string,planId:string) { return executeApprovedRecoveryPlan(services.transactions,requestId,actorUserId,planId); }

export { getIntelligenceStatus, getIntelligenceSummary, listIntelligencePredictions } from './intelligence.ts';
