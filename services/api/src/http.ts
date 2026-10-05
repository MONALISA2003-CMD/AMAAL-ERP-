import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { authenticateBearerToken, AuthenticationError } from '@amaal/auth';
import { DomainError } from '@amaal/shared';
import type { ImeiState } from '@amaal/business-rules';
import { loadAuthorizationContext } from '@amaal/permissions';
import type { ApprovalType } from '@amaal/approvals';
import { SetupError, activateAmaalCeo } from './setup.ts';
import { getWorkspaceSummary } from './workspace.ts';
import { getIntelligenceStatus, getIntelligenceSummary, listIntelligencePredictions } from './intelligence.ts';
import { installRealtimeServer, listRealtimeEvents } from './realtime.ts';
import { MfaError, confirmMfaEnrollment, getMfaStatus, startMfaEnrollment, verifyMfaCode, verifyMfaAssertion } from './mfa.ts';
import {
  approveInventoryAllocation,
  cancelInventoryAllocation,
  completeCashSale,
  createApiServices,
  createApprovalRequest,
  checkDatabaseReadiness,
  getAmaalSetupStatus,
  initializeAmaalOrganization,
  validateSetupInitializeInput,
  decideApproval,
  dispatchInventoryAllocation,
  receiveInventoryAllocation,
  requestInventoryAllocation,
  returnInventoryToWarehouse,
  executeApprovedInventoryCorrection,
  reverseSale,
  createRecoveryCase,
  assignRecoveryCase,
  addRecoveryActivity,
  acceptRecoveredStock,
  closeRecoveryCase,
  getOrganizationDirectory,
  createRegion,
  createSubregion,
  createTeam,
  createShop,
  provisionPerson,
  provisionAdmin,
  createOrganizationInvitation,
  createAdminInvitation,
  getOrganizationInvitationPreview,
  acceptOrganizationInvitation,
  getInventorySummary,
  searchInventoryImeis,
  listInventoryAllocations,
  listInventoryMovements,
  listInventoryReconciliations,
  createInventoryReconciliation,
  addInventoryReconciliationScans,
  finalizeInventoryReconciliation,
  listCatalogBrands,
  listCatalogProducts,
  listInventoryWarehouses,
  createCatalogBrand,
  createCatalogProduct,
  updateCatalogBrand,
  archiveCatalogBrand,
  updateCatalogProduct,
  archiveCatalogProduct,
  createCatalogVariant,
  updateCatalogVariant,
  archiveCatalogVariant,
  receiveCatalogImeis,
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  listSales,
  getSale,
  listSalePayments,
  listCommissions,
  listBonuses,
  listReceipts,
  getReceipt,
  listLoanProviders,
  createLoanProvider,
  archiveLoanProvider,
  adjustPayment, listPaymentAdjustments,
  assignCustomer,
  createCommissionPolicy,
  createBonusPolicy,
  listPricePolicies,
  createPricePolicy,
  listAgingPolicies,
  createAgingPolicy,
  listAgingQueue,
  listRecoveryQueue,
  getRecoveryCase,
  listRecoverySuspensions,
  reassignRecoveryCase,
  reinstateSuspendedUser,
  getOperationalReport,
  getOperationalReportCsv,
  parseReportPeriod,
  parseComparison,
  getAIStatus,
  chatAI,
  createAIConversation,
  listAIActionPlans,
  listAIAwaitingApprovalRequests,
  submitAIActionPlan,
  decideAIAwaitingApproval,
  executeAIRecoveryPlan,
} from './index.ts';

const MAX_BODY_BYTES = 64 * 1024;

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body too large.');
    chunks.push(buffer);
  }
  if (size === 0) return {};
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON object required.');
  return parsed as Record<string, unknown>;
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', Buffer.byteLength(body));
  res.end(body);
}

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${key} is required.`);
  return value.trim();
}

function requiredNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`${key} must be a positive number.`);
  return value;
}

function requiredNonNegativeNumber(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${key} must be a non-negative number.`);
  return value;
}

function allocationCommand(body: Record<string, unknown>) {
  const rawImeiIds = body.imeiIds;
  if (!Array.isArray(rawImeiIds) || rawImeiIds.some((x) => typeof x !== 'string' || !x.trim())) throw new Error('imeiIds must be a non-empty string array.');
  const targetRaw = body.target;
  if (!targetRaw || typeof targetRaw !== 'object' || Array.isArray(targetRaw)) throw new Error('target is required.');
  const target = targetRaw as Record<string, unknown>;
  const kind = target.kind;
  if (typeof kind !== 'string') throw new Error('target.kind is required.');
  const notes = typeof body.notes === 'string' && body.notes.trim() ? { notes: body.notes.trim() } : {};
  if (kind === 'WAREHOUSE') return { imeiIds:rawImeiIds.map((x)=>x.trim()), target:{kind:'WAREHOUSE' as const,warehouseId:requiredTargetString(target,'warehouseId')}, reason:requiredString(body,'reason'), ...notes };
  if (kind === 'MANAGER') return { imeiIds:rawImeiIds.map((x)=>x.trim()), target:{kind:'MANAGER' as const,holderUserId:requiredTargetString(target,'holderUserId')}, reason:requiredString(body,'reason'), ...notes };
  if (kind === 'TEAM') return { imeiIds:rawImeiIds.map((x)=>x.trim()), target:{kind:'TEAM' as const,teamId:requiredTargetString(target,'teamId')}, reason:requiredString(body,'reason'), ...notes };
  if (kind === 'AGENT') return { imeiIds:rawImeiIds.map((x)=>x.trim()), target:{kind:'AGENT' as const,holderUserId:requiredTargetString(target,'holderUserId'),teamId:requiredTargetString(target,'teamId')}, reason:requiredString(body,'reason'), ...notes };
  if (kind === 'SHOP') return { imeiIds:rawImeiIds.map((x)=>x.trim()), target:{kind:'SHOP' as const,holderUserId:requiredTargetString(target,'holderUserId'),teamId:requiredTargetString(target,'teamId'),shopId:requiredTargetString(target,'shopId')}, reason:requiredString(body,'reason'), ...notes };
  throw new Error('Unsupported allocation target kind.');
}

const IMEI_STATES: readonly ImeiState[] = [
  'RECEIVED','MASTER_WAREHOUSE','REGIONAL_WAREHOUSE','ALLOCATED_TO_MANAGER','ALLOCATED_TO_TEAM',
  'ALLOCATED_TO_AGENT','ALLOCATED_TO_SHOP','SOLD','RETURNED','RECOVERY_PENDING','RECOVERED','DAMAGED','LOST',
  'QUARANTINE','TRANSFER_PENDING',
];

function requiredImeiState(body: Record<string, unknown>, key: string): ImeiState {
  const value = requiredString(body, key);
  if (!IMEI_STATES.includes(value as ImeiState)) throw new Error(`${key} is not a valid IMEI state.`);
  return value as ImeiState;
}

function requiredTargetString(target:Record<string,unknown>,key:string):string {
  const value=target[key];
  if(typeof value!=='string'||!value.trim()) throw new Error(`target.${key} is required.`);
  return value.trim();
}

function domainStatus(error: DomainError): number {
  switch (error.code) {
    case 'AUTHORIZATION_DENIED': return 403;
    case 'VALIDATION_ERROR': return 400;
    case 'CONFLICT': return 409;
    default: return 422;
  }
}

function requestPath(req: IncomingMessage): string {
  const rawPath = (req.url ?? '/').split('?', 1)[0] || '/';
  // The public API contract uses /api/v1, while the Phase 1 implementation
  // currently uses /v1. Normalize both at the HTTP boundary so clients can
  // follow the contract without duplicating handlers.
  if (rawPath === '/api') return '/';
  if (rawPath.startsWith('/api/')) return rawPath.slice('/api'.length) || '/';
  return rawPath;
}

function isPotentialApiRoute(method: string | undefined, pathname: string): boolean {
  if (!pathname.startsWith('/v1/')) return false;
  if (method === 'GET' && (pathname === '/v1/workspace/summary' || pathname === '/v1/realtime/events' || pathname === '/v1/reports/operational' || pathname === '/v1/reports/operational.csv' || pathname === '/v1/ai/status' || pathname === '/v1/ai/action-plans' || pathname === '/v1/ai/approvals' || pathname === '/v1/auth/config' || pathname === '/v1/setup/status' || pathname === '/v1/me' || pathname === '/v1/me/scope' || pathname === '/v1/mfa/status' || pathname === '/v1/org/directory' || pathname === '/v1/org/invitations/preview' || pathname === '/v1/catalog/brands' || pathname === '/v1/catalog/products' || pathname === '/v1/catalog/price-policies' || pathname === '/v1/inventory/warehouses' || pathname === '/v1/inventory/summary' || pathname === '/v1/inventory/allocations' || pathname === '/v1/inventory/imeis' || pathname === '/v1/inventory/reconciliations' || pathname === '/v1/customers' || pathname === '/v1/sales' || pathname === '/v1/finance/commissions' || pathname === '/v1/finance/bonuses' || pathname === '/v1/finance/receipts' || pathname === '/v1/finance/loan-providers' || pathname === '/v1/finance/payment-adjustments' || pathname === '/v1/finance/commission-policies' || pathname === '/v1/finance/bonus-policies' || pathname === '/v1/aging/policies' || pathname === '/v1/aging/queue' || pathname === '/v1/recovery/cases' || pathname === '/v1/recovery/suspensions' || /^\/v1\/(customers|sales)\/[^/]+$/.test(pathname) || /^\/v1\/recovery\/cases\/[^/]+$/.test(pathname) || /^\/v1\/sales\/[^/]+\/payments$/.test(pathname) || /^\/v1\/finance\/receipts\/[^/]+$/.test(pathname))) return true;
  if (method === 'GET' && /^\/v1\/inventory\/imeis\/[^/]+\/movements$/.test(pathname)) return true;
  if (method === 'POST' && (pathname === '/v1/aging/policies' || pathname === '/v1/setup/initialize' || pathname === '/v1/setup/activate-ceo' || pathname === '/v1/mfa/enroll/start' || pathname === '/v1/mfa/enroll/confirm' || pathname === '/v1/mfa/verify' || pathname === '/v1/sales' || pathname === '/v1/sales/cash' || pathname === '/v1/inventory/allocations' || pathname === '/v1/inventory/returns' || pathname === '/v1/inventory/corrections' || pathname === '/v1/inventory/receipts' || pathname === '/v1/recovery/cases' || pathname === '/v1/ai/chat' || pathname === '/v1/ai/conversations' || pathname === '/v1/approvals' || pathname === '/v1/org/regions' || pathname === '/v1/org/subregions' || pathname === '/v1/org/teams' || pathname === '/v1/org/shops' || pathname === '/v1/org/people' || pathname === '/v1/org/admins' || pathname === '/v1/org/admin-invitations' || pathname === '/v1/org/invitations' || pathname === '/v1/org/invitations/accept' || pathname === '/v1/catalog/brands' || pathname === '/v1/catalog/products' || pathname === '/v1/catalog/variants' || pathname === '/v1/catalog/price-policies' || pathname === '/v1/customers' || pathname === '/v1/customers/assign' || pathname === '/v1/finance/commission-policies' || pathname === '/v1/finance/bonus-policies' || pathname === '/v1/finance/payment-adjustments' || pathname === '/v1/finance/loan-providers' || pathname === '/v1/inventory/reconciliations' || pathname === '/v1/recovery/cases' || /^\/v1\/(customers|sales)\/[^/]+\/(update|reverse)$/.test(pathname) || /^\/v1\/inventory\/reconciliations\/[^/]+\/(scan|finalize)$/.test(pathname) || /^\/v1\/finance\/loan-providers\/[^/]+\/archive$/.test(pathname))) return true;
  if (method !== 'POST') return false;
  if (/^\/v1\/catalog\/(brands|products|variants)\/[^/]+\/(update|archive)$/.test(pathname)) return true;
  if (/^\/v1\/ai\/action-plans\/[^/]+\/(submit|execute)$/.test(pathname)) return true;
  if (/^\/v1\/ai\/approvals\/[^/]+\/decision$/.test(pathname)) return true;
  return /^\/v1\/(?:sales\/[^/]+\/reverse|inventory\/allocations\/[^/]+\/(?:approve|dispatch|receive|cancel|reject)|recovery\/cases\/[^/]+\/(?:assign|activity|accept|close|reassign)|recovery\/suspensions\/[^/]+\/reinstate|approvals\/[^/]+\/decision)$/.test(pathname);
}

function isMfaEnforced(): boolean {
  const raw = process.env.AMAAL_MFA_ENFORCED?.trim().toLowerCase();
  return raw !== 'false';
}

async function getAmaalAccessState(services: ReturnType<typeof createApiServices>, userId: string, bannedClaim: boolean | null): Promise<'ACTIVE'|'PENDING_ASSIGNMENT'|'SUSPENDED'> {
  if (bannedClaim === true) return 'SUSPENDED';
  const suspended = await services.pool.query<{user_id:string}>({ text: `select user_id from public.business_access_suspensions where user_id=$1 and status='ACTIVE' limit 1`, values:[userId] } as any);
  if (suspended.length) return 'SUSPENDED';
  const rows = await services.pool.query<{profile_status:string|null; active_roles:string[]}>({
    text: `select p.status as profile_status, coalesce(array_agg(distinct ra.role) filter (where ra.user_id is not null), '{}'::text[]) as active_roles
            from neon_auth."user" u
            left join public.profiles p on p.user_id=u.id
            left join public.role_assignments ra on ra.user_id=u.id and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to > now())
            where u.id=$1
            group by p.status`,
    values: [userId],
  } as any);
  const row = rows[0];
  if (!row || row.profile_status !== 'ACTIVE' || !row.active_roles?.length) return row?.profile_status === 'SUSPENDED' ? 'SUSPENDED' : 'PENDING_ASSIGNMENT';
  return 'ACTIVE';
}

export function createApiServer() {
  const services = createApiServices();
  const mfaEnforced = isMfaEnforced();
  const server = createServer(async (req,res) => {
    const requestId=req.headers['x-request-id']?.toString()||randomUUID();
    res.setHeader('x-request-id',requestId);
    const configuredOrigins = (process.env.AMAAL_WEB_ORIGIN ?? '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean);
    const allowedOrigins = new Set([
      ...configuredOrigins,
      'https://amaal-erp.vercel.app',
    ]);
    const requestOrigin = typeof req.headers.origin === 'string' ? req.headers.origin.replace(/\/$/, '') : '';
    const trustedVercelOrigin = (() => {
      if (!requestOrigin) return false;
      try {
        const url = new URL(requestOrigin);
        return url.protocol === 'https:'
          && url.hostname.endsWith('.vercel.app')
          && url.hostname.startsWith('amaal-')
          && url.hostname.endsWith('-projects.vercel.app');
      } catch {
        return false;
      }
    })();
    if (requestOrigin && (allowedOrigins.has(requestOrigin) || trustedVercelOrigin)) {
      res.setHeader('access-control-allow-origin', requestOrigin);
      res.setHeader('access-control-allow-headers', 'authorization,content-type,x-request-id,x-idempotency-key,x-amaal-mfa-assertion');
      res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
      res.setHeader('vary', 'Origin');
    }
    try {
      if(req.method==='OPTIONS'){ res.statusCode=204; res.end(); return; }
      const pathname = requestPath(req);
      if (req.method === 'GET' && pathname === '/v1/setup/status') {
        const status = await getAmaalSetupStatus(services);
        json(res, 200, { requestId, ...status });
        return;
      }
      if (req.method === 'GET' && pathname === '/v1/auth/config') {
        const neonAuthUrl = process.env.AMAAL_NEON_AUTH_URL?.trim();
        if (!neonAuthUrl) {
          json(res, 503, { error: 'AUTH_CONFIG_UNAVAILABLE', message: 'Public authentication configuration is not available.', requestId });
          return;
        }
        json(res, 200, { requestId, neonAuthUrl });
        return;
      }
      const publicHealthPaths = new Set(['/health','/ready']);
      if (publicHealthPaths.has(pathname)) {
        if (req.method !== 'GET') { json(res,405,{error:'METHOD_NOT_ALLOWED',message:'Health endpoints accept GET requests only.',requestId}); return; }
        if (pathname === '/health') { json(res,200,{ok:true,service:'amaal-api'}); return; }
        try {
          const databaseReady = await checkDatabaseReadiness(services);
          if (databaseReady) { json(res,200,{ok:true,ready:true,service:'amaal-api',checks:{database:'ok'}}); return; }
          json(res,503,{ok:false,ready:false,service:'amaal-api',checks:{database:'failed'},requestId}); return;
        } catch {
          json(res,503,{ok:false,ready:false,service:'amaal-api',checks:{database:'failed'},requestId}); return;
        }
      }
      if (!isPotentialApiRoute(req.method, pathname)) { json(res,404,{error:'NOT_FOUND',requestId}); return; }

      if (req.method === 'POST' && pathname === '/v1/setup/initialize') {
        const body = await readJson(req);
        const input = validateSetupInitializeInput(body);
        const result = await initializeAmaalOrganization(services, requestId, input);
        json(res, 201, { requestId, ...result });
        return;
      }

      const authorizationHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
      const user = await authenticateBearerToken(authorizationHeader);

      if (req.method === 'GET' && pathname === '/v1/org/directory') {
        const directory = await getOrganizationDirectory(services, user.id);
        json(res,200,{requestId,items:directory});
        return;
      }

      if (req.method === 'GET' && pathname === '/v1/customers') {
        const url=new URL(req.url ?? '/',`http://${req.headers.host ?? 'localhost'}`);
        const limit=Number(url.searchParams.get('limit') ?? 100);
        const items=await listCustomers(services,requestId,user.id,url.searchParams.get('q') ?? '',Number.isFinite(limit)?limit:100);
        json(res,200,{requestId,items}); return;
      }
      const customerMatch=req.method==='GET'?pathname.match(/^\/v1\/customers\/([^/]+)$/):null;
      if(customerMatch){ const item=await getCustomer(services,requestId,user.id,customerMatch[1]!); json(res,200,{requestId,item}); return; }
      if (req.method === 'GET' && pathname === '/v1/sales') {
        const url=new URL(req.url ?? '/',`http://${req.headers.host ?? 'localhost'}`);
        const limit=Number(url.searchParams.get('limit') ?? 100);
        const paymentType=url.searchParams.get('paymentType');
        const items=await listSales(services,requestId,user.id,{q:url.searchParams.get('q') ?? undefined,from:url.searchParams.get('from') ?? undefined,to:url.searchParams.get('to') ?? undefined,paymentType:paymentType==='CASH'||paymentType==='LOAN'?paymentType:undefined,sellerUserId:url.searchParams.get('sellerUserId') ?? undefined,limit:Number.isFinite(limit)?limit:100});
        json(res,200,{requestId,items}); return;
      }
      const receiptMatch=req.method==='GET'?pathname.match(/^\/v1\/finance\/receipts\/([^/]+)$/):null;
      if(receiptMatch){ const item=await getReceipt(services,requestId,user.id,receiptMatch[1]!); json(res,200,{requestId,item}); return; }
      const saleMatch=req.method==='GET'?pathname.match(/^\/v1\/sales\/([^/]+)$/):null;
      if(saleMatch){ const item=await getSale(services,requestId,user.id,saleMatch[1]!); json(res,200,{requestId,item}); return; }
      const salePaymentsMatch=req.method==='GET'?pathname.match(/^\/v1\/sales\/([^/]+)\/payments$/):null;
      if(salePaymentsMatch){ const items=await listSalePayments(services,requestId,user.id,salePaymentsMatch[1]!); json(res,200,{requestId,items}); return; }
      if(req.method==='GET'&&pathname==='/v1/finance/commissions'){
        const url=new URL(req.url ?? '/',`http://${req.headers.host ?? 'localhost'}`); const limit=Number(url.searchParams.get('limit')??100);
        const items=await listCommissions(services,requestId,user.id,{from:url.searchParams.get('from')??undefined,to:url.searchParams.get('to')??undefined,userId:url.searchParams.get('userId')??undefined,role:url.searchParams.get('role')??undefined,limit:Number.isFinite(limit)?limit:100});
        json(res,200,{requestId,items}); return;
      }
      if(req.method==='GET'&&pathname==='/v1/finance/bonuses'){ const url=new URL(req.url ?? '/',`http://${req.headers.host ?? 'localhost'}`); const limit=Number(url.searchParams.get('limit')??100); const items=await listBonuses(services,requestId,user.id,Number.isFinite(limit)?limit:100); json(res,200,{requestId,items}); return; }
      if(req.method==='GET'&&pathname==='/v1/finance/receipts'){ const url=new URL(req.url ?? '/',`http://${req.headers.host ?? 'localhost'}`); const limit=Number(url.searchParams.get('limit')??100); const items=await listReceipts(services,requestId,user.id,Number.isFinite(limit)?limit:100); json(res,200,{requestId,items}); return; }
      if(req.method==='GET'&&pathname==='/v1/finance/loan-providers'){ const items=await listLoanProviders(services,requestId,user.id); json(res,200,{requestId,items}); return; }
      if(req.method==='GET'&&pathname==='/v1/finance/payment-adjustments'){ const url=new URL(req.url ?? '/',`http://${req.headers.host ?? 'localhost'}`); const paymentId=url.searchParams.get('paymentId')??undefined; const limit=Number(url.searchParams.get('limit')??100); const items=await listPaymentAdjustments(services,requestId,user.id,paymentId,Number.isFinite(limit)?limit:100); json(res,200,{requestId,items}); return; }
      if(req.method==='GET'&&pathname==='/v1/finance/commission-policies'){ const items=await services.transactions.withTransaction({requestId,actorUserId:user.id},tx=>services.financeLedger.listCommissionPolicies(tx,user.id)); json(res,200,{requestId,items}); return; }
      if(req.method==='GET'&&pathname==='/v1/finance/bonus-policies'){ const items=await services.transactions.withTransaction({requestId,actorUserId:user.id},tx=>services.financeLedger.listBonusPolicies(tx,user.id)); json(res,200,{requestId,items}); return; }
      if(req.method==='GET'&&pathname==='/v1/catalog/price-policies'){ const url=new URL(req.url ?? '/',`http://${req.headers.host ?? 'localhost'}`); const items=await listPricePolicies(services,requestId,user.id,url.searchParams.get('productVariantId')??undefined); json(res,200,{requestId,items}); return; }

      if (req.method === 'GET' && pathname === '/v1/catalog/brands') {
        const brands = await listCatalogBrands(services,requestId,user.id);
        json(res,200,{requestId,items:brands});
        return;
      }
      if (req.method === 'GET' && pathname === '/v1/catalog/products') {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const products = await listCatalogProducts(services,requestId,user.id,url.searchParams.get('q') ?? '');
        json(res,200,{requestId,items:products});
        return;
      }
      if (req.method === 'GET' && pathname === '/v1/inventory/warehouses') {
        const warehouses = await listInventoryWarehouses(services,requestId,user.id);
        json(res,200,{requestId,items:warehouses});
        return;
      }
      if (req.method === 'GET' && pathname === '/v1/inventory/summary') {
        const summary = await getInventorySummary(services,requestId,user.id);
        json(res,200,{requestId,...summary});
        return;
      }
      if (req.method === 'GET' && pathname === '/v1/inventory/reconciliations') {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const limit = Number(url.searchParams.get('limit') ?? 50);
        const items = await listInventoryReconciliations(services,requestId,user.id,Number.isFinite(limit) ? limit : 50);
        json(res,200,{requestId,items});
        return;
      }

      if (req.method === 'GET' && pathname === '/v1/inventory/imeis') {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const items = await searchInventoryImeis(services,requestId,user.id,{
          query:url.searchParams.get('q') ?? '',
          state:url.searchParams.get('state') ?? undefined,
          agingStatus:url.searchParams.get('agingStatus') ?? undefined,
          limit:url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
        });
        json(res,200,{requestId,items});
        return;
      }
      if (req.method === 'GET' && pathname === '/v1/inventory/allocations') {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined;
        const items = await listInventoryAllocations(services,requestId,user.id,Number.isFinite(limit ?? 0) ? limit : undefined);
        json(res,200,{requestId,items});
        return;
      }
      const movementMatch = req.method === 'GET' ? pathname.match(/^\/v1\/inventory\/imeis\/([^/]+)\/movements$/) : null;
      if (movementMatch) {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined;
        const movements = await listInventoryMovements(services,requestId,user.id,movementMatch[1]!,Number.isFinite(limit ?? 0) ? limit : undefined);
        json(res,200,{requestId,items:movements});
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/setup/activate-ceo') {
        const body = await readJson(req);
        const result = await activateAmaalCeo(services, requestId, user.id, user.email, requiredString(body, 'activationCode'));
        json(res, 200, { requestId, ...result });
        return;
      }

      const mfaAssertion = typeof req.headers['x-amaal-mfa-assertion'] === 'string' ? req.headers['x-amaal-mfa-assertion'] : undefined;

      if (req.method === 'GET' && pathname === '/v1/workspace/summary') {
        const summary = await getWorkspaceSummary(services, requestId, user.id);
        json(res, 200, { requestId, ...summary as Record<string, unknown> });
        return;
      }
      if (req.method === 'GET' && pathname === '/v1/reports/operational') {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const report = await getOperationalReport(services, requestId, user.id, {
          period: parseReportPeriod(url.searchParams.get('period')),
          comparison: parseComparison(url.searchParams.get('comparison')),
          regionId: url.searchParams.get('regionId') ?? undefined,
          teamId: url.searchParams.get('teamId') ?? undefined,
        });
        json(res, 200, { requestId, ...report as Record<string, unknown> });
        return;
      }
      if (req.method === 'GET' && pathname === '/v1/reports/operational.csv') {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const exported = await getOperationalReportCsv(services, requestId, user.id, {
          period: parseReportPeriod(url.searchParams.get('period')),
          comparison: parseComparison(url.searchParams.get('comparison')),
          regionId: url.searchParams.get('regionId') ?? undefined,
          teamId: url.searchParams.get('teamId') ?? undefined,
        });
        res.writeHead(200, {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${exported.filename}"`,
          'cache-control': 'private, no-store',
          'x-request-id': requestId,
        });
        res.end(exported.csv);
        return;
      }

      if (req.method === 'GET' && pathname === '/v1/intelligence/status') {
        const status = await getIntelligenceStatus(services,requestId,user.id);
        json(res,200,status);
        return;
      }
      if (req.method === 'GET' && pathname === '/v1/intelligence/summary') {
        const summary = await getIntelligenceSummary(services,requestId,user.id);
        json(res,200,summary);
        return;
      }
      if (req.method === 'GET' && pathname === '/v1/intelligence/predictions') {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const kind = url.searchParams.get('kind') ?? undefined;
        const limit = Number(url.searchParams.get('limit') ?? 20);
        const result = await listIntelligencePredictions(services,requestId,user.id,{kind: kind as any, limit});
        json(res,200,{requestId,...result});
        return;
      }

      if (req.method === 'GET' && pathname === '/v1/ai/status') {
        const status = await getAIStatus(services,requestId,user.id);
        json(res,200,{requestId,...status});
        return;
      }
      if (req.method === 'GET' && pathname === '/v1/ai/action-plans') {
        const items = await listAIActionPlans(services,requestId,user.id);
        json(res,200,{requestId,items});
        return;
      }
      if (req.method === 'GET' && pathname === '/v1/ai/approvals') {
        const items = await listAIAwaitingApprovalRequests(services,requestId,user.id);
        json(res,200,{requestId,items});
        return;
      }
      const idempotencyKey = typeof req.headers['x-idempotency-key'] === 'string' ? req.headers['x-idempotency-key'].trim() || undefined : undefined;

      if (req.method === 'POST' && pathname === '/v1/ai/conversations') {
        const body = await readJson(req);
        const title = typeof body.title === 'string' ? body.title : undefined;
        const conversation = await createAIConversation(services,requestId,user.id,title === undefined ? {} : {title});
        json(res,201,{requestId,conversation});
        return;
      }
      if (req.method === 'POST' && pathname === '/v1/ai/chat') {
        const body = await readJson(req);
        const message = requiredString(body,'message');
        const conversationId = typeof body.conversationId === 'string' && body.conversationId.trim() ? body.conversationId.trim() : undefined;
        const result = await chatAI(services,requestId,user.id,{message,...(conversationId?{conversationId}: {})});
        json(res,200,{requestId,...result});
        return;
      }
      const aiSubmitMatch=req.method==='POST'?pathname.match(/^\/v1\/ai\/action-plans\/([^/]+)\/submit$/):null;
      if(aiSubmitMatch){
        const body=await readJson(req);
        const result=await submitAIActionPlan(services,requestId,user.id,aiSubmitMatch[1]!,requiredString(body,'reason'));
        json(res,200,{requestId,...result,status:'PENDING_APPROVAL'});
        return;
      }
      const aiExecuteMatch=req.method==='POST'?pathname.match(/^\/v1\/ai\/action-plans\/([^/]+)\/execute$/):null;
      if(aiExecuteMatch){
        const result=await executeAIRecoveryPlan(services,requestId,user.id,aiExecuteMatch[1]!);
        json(res,200,{requestId,...result});
        return;
      }
      const aiApprovalDecisionMatch=req.method==='POST'?pathname.match(/^\/v1\/ai\/approvals\/([^/]+)\/decision$/):null;
      if(aiApprovalDecisionMatch){
        const body=await readJson(req);
        const decision=requiredString(body,'decision');
        if(decision!=='APPROVED'&&decision!=='REJECTED') throw new Error('decision must be APPROVED or REJECTED.');
        const approvalId=aiApprovalDecisionMatch[1];
        if(!approvalId) throw new Error('approvalId is required.');
        const result=await decideAIAwaitingApproval(services,requestId,user.id,approvalId,decision,requiredString(body,'reason'),idempotencyKey);
        json(res,200,{requestId,...result});
        return;
      }

      if (req.method === 'GET' && pathname === '/v1/realtime/events') {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const after = Math.max(Number(url.searchParams.get('after') ?? 0) || 0, 0);
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 100) || 100, 1), 250);
        const replay = await services.transactions.withTransaction({ requestId, actorUserId: user.id }, async (tx) => {
          const context = await loadAuthorizationContext(tx, user.id);
          return listRealtimeEvents(services, context, after, limit);
        });
        json(res, 200, { requestId, ...replay });
        return;
      }

      if(req.method==='GET'&&(pathname==='/v1/me'||pathname==='/v1/me/scope')){
        const scope = await services.transactions.withTransaction({requestId,actorUserId:user.id}, async (tx) => loadAuthorizationContext(tx,user.id));
        const accessState = await getAmaalAccessState(services,user.id,typeof user.banned==='boolean'?user.banned:null);
        const privileged = scope.roles.includes('CEO') || scope.roles.includes('ADMIN');
        const mfaRequired = privileged && mfaEnforced;
        const mfaVerified = !mfaRequired || verifyMfaAssertion(mfaAssertion, user.id, user.sessionId);
        if(pathname==='/v1/me/scope'){ json(res,200,{requestId,authorization:scope,accessState,mfaRequired,mfaVerified}); return; }
        json(res,200,{requestId,user:{id:user.id,email:user.email},authorization:scope,accessState,mfaRequired,mfaVerified}); return;
      }

      const context = await services.transactions.withTransaction({requestId,actorUserId:user.id}, async (tx) => loadAuthorizationContext(tx,user.id));
      const accessState = await getAmaalAccessState(services,user.id,typeof user.banned==='boolean'?user.banned:null);
      const privileged = context.roles.includes('CEO') || context.roles.includes('ADMIN');
      const onboardingAllowed = pathname === '/v1/org/invitations/accept' || pathname === '/v1/mfa/status' || pathname === '/v1/mfa/enroll/start' || pathname === '/v1/mfa/enroll/confirm' || pathname === '/v1/mfa/verify';
      if (accessState !== 'ACTIVE' && !onboardingAllowed) {
        json(res,403,{error:accessState==='SUSPENDED'?'ACCOUNT_SUSPENDED':'ACCESS_PENDING',message:accessState==='SUSPENDED'?'Your Amaal account is suspended.':'Your Neon Auth account is authenticated but has not been assigned active Amaal organizational access.',requestId});
        return;
      }
      if (mfaEnforced && privileged && pathname !== '/v1/mfa/status' && pathname !== '/v1/mfa/enroll/start' && pathname !== '/v1/mfa/enroll/confirm' && pathname !== '/v1/mfa/verify' && !verifyMfaAssertion(mfaAssertion, user.id, user.sessionId)) {
        json(res,403,{error:'MFA_REQUIRED',message:'CEO and Admin ERP operations require verified multi-factor authentication.',requestId,mfaRequired:true});
        return;
      }

      if (req.method === 'GET' && pathname === '/v1/mfa/status') {
        const status = await getMfaStatus(services.pool, user.id, privileged && mfaEnforced, user.sessionId, mfaAssertion);
        json(res,200,{requestId,...status});
        return;
      }
      if (req.method === 'POST' && pathname === '/v1/mfa/enroll/start') {
        if (!privileged) { json(res,403,{error:'AUTHORIZATION_DENIED',message:'MFA setup is only available to privileged Amaal roles.',requestId}); return; }
        const enrolled = await startMfaEnrollment(services.pool,user.id,user.email);
        json(res,200,{requestId,...enrolled});
        return;
      }
      if (req.method === 'POST' && pathname === '/v1/mfa/enroll/confirm') {
        if (!privileged) { json(res,403,{error:'AUTHORIZATION_DENIED',message:'MFA setup is only available to privileged Amaal roles.',requestId}); return; }
        const body = await readJson(req);
        const assertion = await confirmMfaEnrollment(services.pool,user.id,requiredString(body,'code'),user.sessionId);
        json(res,200,{requestId,status:'VERIFIED',mfaAssertion:assertion});
        return;
      }
      if (req.method === 'POST' && pathname === '/v1/mfa/verify') {
        if (!privileged) { json(res,403,{error:'AUTHORIZATION_DENIED',message:'MFA verification is only available to privileged Amaal roles.',requestId}); return; }
        const body = await readJson(req);
        const assertion = await verifyMfaCode(services.pool,user.id,requiredString(body,'code'),user.sessionId);
        json(res,200,{requestId,status:'VERIFIED',mfaAssertion:assertion});
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/org/regions') {
        const body = await readJson(req);
        const region = await createRegion(services,user.id,{code:requiredString(body,'code'),name:requiredString(body,'name'),...(typeof body.description==='string'?{description:body.description}:{})});
        json(res,201,{requestId,...region});
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/org/subregions') {
        const body = await readJson(req);
        const subregion = await createSubregion(services,user.id,{regionId:requiredString(body,'regionId'),code:requiredString(body,'code'),name:requiredString(body,'name'),...(typeof body.description==='string'?{description:body.description}:{})});
        json(res,201,{requestId,...subregion});
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/org/teams') {
        const body = await readJson(req);
        const team = await createTeam(services,user.id,{regionId:requiredString(body,'regionId'),managerUserId:requiredString(body,'managerUserId'),...(typeof body.subregionId==='string'?{subregionId:body.subregionId}:{}),teamCode:requiredString(body,'teamCode'),teamName:requiredString(body,'teamName')});
        json(res,201,{requestId,...team});
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/org/shops') {
        const body = await readJson(req);
        const shop = await createShop(services,user.id,{teamId:requiredString(body,'teamId'),shopCode:requiredString(body,'shopCode'),shopName:requiredString(body,'shopName'),...(typeof body.location==='string'?{location:body.location}:{} )});
        json(res,201,{requestId,...shop});
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/org/people') {
        const body = await readJson(req);
        const role = requiredString(body,'role');
        const roles = ['REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER','RECOVERY_OFFICER'] as const;
        if (!roles.includes(role as typeof roles[number])) throw new Error('Unsupported organizational role.');
        const person = await provisionPerson(services,user.id,{
          userId:requiredString(body,'userId'),
          displayName:requiredString(body,'displayName'),
          role:role as typeof roles[number],
          ...(typeof body.employeeNumber==='string'?{employeeNumber:body.employeeNumber}:{}),
          ...(typeof body.phone==='string'?{phone:body.phone}:{}),
          ...(typeof body.regionId==='string'?{regionId:body.regionId}:{}),
          ...(typeof body.regionalManagerUserId==='string'?{regionalManagerUserId:body.regionalManagerUserId}:{}),
          ...(typeof body.subregionId==='string'?{subregionId:body.subregionId}:{}),
          ...(typeof body.managerUserId==='string'?{managerUserId:body.managerUserId}:{}),
          ...(typeof body.teamId==='string'?{teamId:body.teamId}:{}),
          ...(typeof body.shopId==='string'?{shopId:body.shopId}:{}),
        });
        json(res,201,{requestId,...person});
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/org/admins') {
        const body = await readJson(req);
        const admin = await provisionAdmin(services,user.id,{userId:requiredString(body,'userId'),displayName:requiredString(body,'displayName'),profileKey:requiredString(body,'profileKey'),...(typeof body.employeeNumber==='string'?{employeeNumber:body.employeeNumber}:{}),...(typeof body.phone==='string'?{phone:body.phone}:{})});
        json(res,201,{requestId,...admin});
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/org/admin-invitations') {
        const body = await readJson(req);
        const invitation = await createAdminInvitation(services,user.id,{
          email:requiredString(body,'email'),displayName:requiredString(body,'displayName'),
          profileKey:requiredString(body,'profileKey'),
          ...(typeof body.employeeNumber==='string'?{employeeNumber:body.employeeNumber}:{}),
          ...(typeof body.phone==='string'?{phone:body.phone}:{}),
          ...(typeof body.expiresInHours==='number'?{expiresInHours:body.expiresInHours}:{}),
        });
        json(res,201,{requestId,...invitation});
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/org/invitations') {
        const body = await readJson(req);
        const invitation = await createOrganizationInvitation(services,user.id,{
          email:requiredString(body,'email'),displayName:requiredString(body,'displayName'),role:requiredString(body,'role') as any,
          ...(typeof body.employeeNumber==='string'?{employeeNumber:body.employeeNumber}:{}),
          ...(typeof body.phone==='string'?{phone:body.phone}:{}),
          ...(typeof body.regionId==='string'?{regionId:body.regionId}:{}),
          ...(typeof body.regionalManagerUserId==='string'?{regionalManagerUserId:body.regionalManagerUserId}:{}),
          ...(typeof body.subregionId==='string'?{subregionId:body.subregionId}:{}),
          ...(typeof body.managerUserId==='string'?{managerUserId:body.managerUserId}:{}),
          ...(typeof body.teamId==='string'?{teamId:body.teamId}:{}),
          ...(typeof body.shopId==='string'?{shopId:body.shopId}:{}),
          ...(typeof body.expiresInHours==='number'?{expiresInHours:body.expiresInHours}:{}),
        });
        json(res,201,{requestId,...invitation});
        return;
      }

      if (req.method === 'GET' && pathname === '/v1/org/invitations/preview') {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const token = url.searchParams.get('token') ?? '';
        const preview = await getOrganizationInvitationPreview(services,token);
        json(res,200,{requestId,...preview});
        return;
      }

      if (req.method === 'POST' && pathname === '/v1/org/invitations/accept') {
        const body = await readJson(req);
        const result = await acceptOrganizationInvitation(services,user.id,user.email,requiredString(body,'token'));
        json(res,200,{requestId,...result});
        return;
      }

      if(req.method==='POST'&&pathname==='/v1/catalog/brands'){
        const body=await readJson(req);
        const result=await createCatalogBrand(services,requestId,user.id,{name:requiredString(body,'name')},idempotencyKey);
        json(res,201,{requestId,...result}); return;
      }
      if(req.method==='POST'&&pathname==='/v1/catalog/products'){
        const body=await readJson(req);
        const result=await createCatalogProduct(services,requestId,user.id,{brandId:requiredString(body,'brandId'),modelName:requiredString(body,'modelName'),category:typeof body.category==='string'?body.category:undefined,description:typeof body.description==='string'?body.description:undefined},idempotencyKey);
        json(res,201,{requestId,...result}); return;
      }
      if(req.method==='POST'&&pathname==='/v1/catalog/variants'){
        const body=await readJson(req);
        const result=await createCatalogVariant(services,requestId,user.id,{productId:requiredString(body,'productId'),sku:requiredString(body,'sku'),ram:typeof body.ram==='string'?body.ram:undefined,storage:typeof body.storage==='string'?body.storage:undefined,color:typeof body.color==='string'?body.color:undefined,network:typeof body.network==='string'?body.network:undefined,display:typeof body.display==='string'?body.display:undefined,battery:typeof body.battery==='string'?body.battery:undefined,camera:typeof body.camera==='string'?body.camera:undefined,processor:typeof body.processor==='string'?body.processor:undefined,operatingSystem:typeof body.operatingSystem==='string'?body.operatingSystem:undefined,warrantyText:typeof body.warrantyText==='string'?body.warrantyText:undefined,otherSpecs:body.otherSpecs&&typeof body.otherSpecs==='object'&&!Array.isArray(body.otherSpecs)?body.otherSpecs as Record<string,unknown>:undefined},idempotencyKey);
        json(res,201,{requestId,...result}); return;
      }
      const catalogMutationMatch=req.method==='POST'?pathname.match(/^\/v1\/catalog\/(brands|products|variants)\/([^/]+)\/(update|archive)$/):null;
      if(catalogMutationMatch){
        const [,resource,id,action]=catalogMutationMatch;
        const body=action==='archive'?{}:await readJson(req);
        if(resource==='brands' && action==='update') { const result=await updateCatalogBrand(services,requestId,user.id,id!,{name:requiredString(body,'name')},idempotencyKey); json(res,200,{requestId,...result}); return; }
        if(resource==='brands' && action==='archive') { const result=await archiveCatalogBrand(services,requestId,user.id,id!,idempotencyKey); json(res,200,{requestId,...result}); return; }
        if(resource==='products' && action==='update') { const result=await updateCatalogProduct(services,requestId,user.id,id!,{modelName:requiredString(body,'modelName'),category:typeof body.category==='string'?body.category:undefined,description:typeof body.description==='string'?body.description:undefined},idempotencyKey); json(res,200,{requestId,...result}); return; }
        if(resource==='products' && action==='archive') { const result=await archiveCatalogProduct(services,requestId,user.id,id!,idempotencyKey); json(res,200,{requestId,...result}); return; }
        if(resource==='variants' && action==='update') { const result=await updateCatalogVariant(services,requestId,user.id,id!,{sku:requiredString(body,'sku'),ram:typeof body.ram==='string'?body.ram:undefined,storage:typeof body.storage==='string'?body.storage:undefined,color:typeof body.color==='string'?body.color:undefined,network:typeof body.network==='string'?body.network:undefined,display:typeof body.display==='string'?body.display:undefined,battery:typeof body.battery==='string'?body.battery:undefined,camera:typeof body.camera==='string'?body.camera:undefined,processor:typeof body.processor==='string'?body.processor:undefined,operatingSystem:typeof body.operatingSystem==='string'?body.operatingSystem:undefined,warrantyText:typeof body.warrantyText==='string'?body.warrantyText:undefined,otherSpecs:body.otherSpecs&&typeof body.otherSpecs==='object'&&!Array.isArray(body.otherSpecs)?body.otherSpecs as Record<string,unknown>:undefined},idempotencyKey); json(res,200,{requestId,...result}); return; }
        if(resource==='variants' && action==='archive') { const result=await archiveCatalogVariant(services,requestId,user.id,id!,idempotencyKey); json(res,200,{requestId,...result}); return; }
        throw new Error('Unsupported catalog mutation.');
      }

      if(req.method==='POST'&&pathname==='/v1/inventory/reconciliations'){
        const body=await readJson(req);
        if(!body.scope||typeof body.scope!=='object'||Array.isArray(body.scope)) throw new Error('scope is required.');
        const scope=body.scope as Record<string,unknown>;
        const kind=typeof scope.kind==='string'?scope.kind:'';
        if(!['REGION','WAREHOUSE','TEAM','SHOP'].includes(kind)) throw new Error('scope.kind must be REGION, WAREHOUSE, TEAM or SHOP.');
        const scopeId=requiredString(scope,'id');
        const result=await createInventoryReconciliation(services,requestId,user.id,{kind:kind as 'REGION'|'WAREHOUSE'|'TEAM'|'SHOP',id:scopeId},typeof body.notes==='string'?body.notes:undefined,idempotencyKey);
        json(res,201,{requestId,...result}); return;
      }
      const reconScanMatch=req.method==='POST'?pathname.match(/^\/v1\/inventory\/reconciliations\/([^/]+)\/scan$/):null;
      if(reconScanMatch){
        const reconciliationId=reconScanMatch[1]!; const body=await readJson(req);
        if(!Array.isArray(body.scans)||!body.scans.length) throw new Error('scans must be a non-empty array.');
        const scans=body.scans.map((raw,index)=>{ if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new Error(`scans[${index}] must be an object.`); const row=raw as Record<string,unknown>; return {imei:requiredString(row,'imei'),observedHolderUserId:typeof row.observedHolderUserId==='string'?row.observedHolderUserId:undefined,observedWarehouseId:typeof row.observedWarehouseId==='string'?row.observedWarehouseId:undefined,observedRegionId:typeof row.observedRegionId==='string'?row.observedRegionId:undefined,observedTeamId:typeof row.observedTeamId==='string'?row.observedTeamId:undefined,observedShopId:typeof row.observedShopId==='string'?row.observedShopId:undefined,observedCondition:typeof row.observedCondition==='string'&&['NEW','GOOD','DAMAGED','QUARANTINED','WRITEOFF'].includes(row.observedCondition)?row.observedCondition as any:undefined}; });
        const result=await addInventoryReconciliationScans(services,requestId,user.id,reconciliationId,scans,idempotencyKey);
        json(res,200,{requestId,...result}); return;
      }
      const reconFinalizeMatch=req.method==='POST'?pathname.match(/^\/v1\/inventory\/reconciliations\/([^/]+)\/finalize$/):null;
      if(reconFinalizeMatch){
        const reconciliationId=reconFinalizeMatch[1]!;
        const result=await finalizeInventoryReconciliation(services,requestId,user.id,reconciliationId,idempotencyKey);
        json(res,200,{requestId,...result}); return;
      }

      if(req.method==='POST'&&pathname==='/v1/inventory/receipts'){
        const body=await readJson(req);
        if(!Array.isArray(body.units)) throw new Error('units must be a non-empty array.');
        const units=body.units.map((raw,index)=>{
          if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new Error(`units[${index}] must be an object.`);
          const row=raw as Record<string,unknown>;
          return {imei:requiredString(row,'imei'),imei2:typeof row.imei2==='string'?row.imei2:undefined,serialNumber:typeof row.serialNumber==='string'?row.serialNumber:undefined,productVariantId:requiredString(row,'productVariantId')};
        });
        const conditionStatus=typeof body.conditionStatus==='string'&&['NEW','GOOD','DAMAGED','QUARANTINED','WRITEOFF'].includes(body.conditionStatus)?body.conditionStatus as 'NEW'|'GOOD'|'DAMAGED'|'QUARANTINED'|'WRITEOFF':undefined;
        const result=await receiveCatalogImeis(services,requestId,user.id,{warehouseId:requiredString(body,'warehouseId'),purchaseReference:typeof body.purchaseReference==='string'?body.purchaseReference:undefined,conditionStatus,units},idempotencyKey);
        json(res,201,{requestId,...result}); return;
      }

      if(req.method==='POST'&&pathname==='/v1/customers'){ const body=await readJson(req); const result=await createCustomer(services,requestId,user.id,{fullName:requiredString(body,'fullName'),phone:requiredString(body,'phone'),alternativePhone:typeof body.alternativePhone==='string'?body.alternativePhone:undefined,email:typeof body.email==='string'?body.email:undefined,address:typeof body.address==='string'?body.address:undefined,customerType:typeof body.customerType==='string'?body.customerType:undefined,identityReference:typeof body.identityReference==='string'?body.identityReference:undefined,consentStatus:typeof body.consentStatus==='string'?body.consentStatus:undefined},idempotencyKey); json(res,201,{requestId,...result}); return; }
      if(req.method==='POST'&&pathname==='/v1/customers/assign'){ const body=await readJson(req); const result=await assignCustomer(services,requestId,user.id,requiredString(body,'customerId'),requiredString(body,'newOwnerUserId'),requiredString(body,'reason'),idempotencyKey); json(res,200,{requestId,...result}); return; }
      const customerUpdateMatch=req.method==='POST'?pathname.match(/^\/v1\/customers\/([^/]+)\/update$/):null;
      if(customerUpdateMatch){ const body=await readJson(req); const result=await updateCustomer(services,requestId,user.id,customerUpdateMatch[1]!,{fullName:typeof body.fullName==='string'?body.fullName:undefined,phone:typeof body.phone==='string'?body.phone:undefined,alternativePhone:typeof body.alternativePhone==='string'?body.alternativePhone:undefined,email:typeof body.email==='string'?body.email:undefined,address:typeof body.address==='string'?body.address:undefined,customerType:typeof body.customerType==='string'?body.customerType:undefined,identityReference:typeof body.identityReference==='string'?body.identityReference:undefined,consentStatus:typeof body.consentStatus==='string'?body.consentStatus:undefined},idempotencyKey); json(res,200,{requestId,item:result}); return; }
      if(req.method==='POST'&&pathname==='/v1/catalog/price-policies'){ const body=await readJson(req); const result=await createPricePolicy(services,requestId,user.id,{productVariantId:requiredString(body,'productVariantId'),purchasePrice:requiredNumber(body,'purchasePrice'),sellingPrice:requiredNumber(body,'sellingPrice'),minimumPrice:requiredNumber(body,'minimumPrice'),discountLimit:typeof body.discountLimit==='number'?body.discountLimit:0,effectiveFrom:requiredString(body,'effectiveFrom'),effectiveTo:typeof body.effectiveTo==='string'&&body.effectiveTo.trim()?body.effectiveTo.trim():undefined},idempotencyKey); json(res,201,{requestId,...result}); return; }
      if(req.method==='POST'&&pathname==='/v1/finance/commission-policies'){ const body=await readJson(req); const calculationType=requiredString(body,'calculationType'); if(calculationType!=='FIXED_AMOUNT'&&calculationType!=='PERCENT_OF_SALE') throw new Error('Unsupported commission calculationType.'); const role=typeof body.role==='string'&&body.role.trim()?body.role.trim():undefined; const result=await createCommissionPolicy(services,requestId,user.id,{policyName:requiredString(body,'policyName'),role:role as any,productVariantId:typeof body.productVariantId==='string'&&body.productVariantId.trim()?body.productVariantId.trim():undefined,calculationType,rateOrAmount:requiredNonNegativeNumber(body,'rateOrAmount'),conditions:body.conditions&&typeof body.conditions==='object'&&!Array.isArray(body.conditions)?body.conditions as Record<string,unknown>:undefined,effectiveFrom:requiredString(body,'effectiveFrom'),effectiveTo:typeof body.effectiveTo==='string'&&body.effectiveTo.trim()?body.effectiveTo.trim():undefined},idempotencyKey); json(res,201,{requestId,...result}); return; }
      if(req.method==='POST'&&pathname==='/v1/finance/bonus-policies'){ const body=await readJson(req); const eligibleRole=requiredString(body,'eligibleRole'); const targetType=requiredString(body,'targetType'); const bonusType=requiredString(body,'bonusType'); const period=requiredString(body,'period'); if(!['SALES_COUNT','SALES_VALUE'].includes(targetType)||bonusType!=='FIXED_AMOUNT'||!['WEEKLY','MONTHLY','QUARTERLY'].includes(period)) throw new Error('Unsupported bonus policy dimensions.'); const result=await createBonusPolicy(services,requestId,user.id,{policyName:requiredString(body,'policyName'),eligibleRole:eligibleRole as any,targetType:targetType as any,targetValue:requiredNonNegativeNumber(body,'targetValue'),bonusType:'FIXED_AMOUNT',bonusValue:requiredNonNegativeNumber(body,'bonusValue'),period:period as any,conditions:body.conditions&&typeof body.conditions==='object'&&!Array.isArray(body.conditions)?body.conditions as Record<string,unknown>:undefined,effectiveFrom:requiredString(body,'effectiveFrom'),effectiveTo:typeof body.effectiveTo==='string'&&body.effectiveTo.trim()?body.effectiveTo.trim():undefined},idempotencyKey); json(res,201,{requestId,...result}); return; }
      
            if(req.method==='POST'&&pathname==='/v1/sales/cash'){
        const body=await readJson(req);
        const rawLines=Array.isArray(body.lines)?body.lines:[];
        const lines=rawLines.length?rawLines.map((entry)=>{ if(!entry||typeof entry!=='object'||Array.isArray(entry)) throw new Error('Each sale line must be an object.'); const x=entry as Record<string,unknown>; return {imeiId:requiredString(x,'imeiId'),productVariantId:requiredString(x,'productVariantId'),unitPrice:requiredNumber(x,'unitPrice'),discountAmount:typeof x.discountAmount==='number'?x.discountAmount:undefined}; }):[{imeiId:requiredString(body,'imeiId'),productVariantId:requiredString(body,'productVariantId'),unitPrice:requiredNumber(body,'unitPrice'),discountAmount:typeof body.discountAmount==='number'?body.discountAmount:undefined}];
        const sellerUserId=typeof body.sellerUserId==='string'&&body.sellerUserId.trim()?body.sellerUserId.trim():user.id;
        const result=await completeCashSale(services,requestId,user.id,{sellerUserId,customerId:requiredString(body,'customerId'),paymentType:'CASH',paymentMethod:typeof body.paymentMethod==='string'?body.paymentMethod:undefined,lines,...(typeof body.externalPaymentReference==='string'&&body.externalPaymentReference.trim()?{externalPaymentReference:body.externalPaymentReference.trim()}:{}),approvalId:typeof body.approvalId==='string'&&body.approvalId.trim()?body.approvalId.trim():undefined},idempotencyKey);
        json(res,201,{requestId,...result}); return;
      }
      if(req.method==='POST'&&pathname==='/v1/sales'){
        const body=await readJson(req); if(body.paymentType!=='CASH'&&body.paymentType!=='LOAN') throw new Error('paymentType must be CASH or LOAN.');
        if(!Array.isArray(body.lines)||!body.lines.length) throw new Error('lines must be a non-empty array.');
        const lines=body.lines.map((entry)=>{ if(!entry||typeof entry!=='object'||Array.isArray(entry)) throw new Error('Each sale line must be an object.'); const x=entry as Record<string,unknown>; return {imeiId:requiredString(x,'imeiId'),productVariantId:requiredString(x,'productVariantId'),unitPrice:requiredNumber(x,'unitPrice'),discountAmount:typeof x.discountAmount==='number'?x.discountAmount:undefined}; });
        const result=await completeCashSale(services,requestId,user.id,{sellerUserId:typeof body.sellerUserId==='string'&&body.sellerUserId.trim()?body.sellerUserId.trim():user.id,customerId:requiredString(body,'customerId'),paymentType:body.paymentType,paymentMethod:typeof body.paymentMethod==='string'?body.paymentMethod:undefined,lines,externalPaymentReference:typeof body.externalPaymentReference==='string'&&body.externalPaymentReference.trim()?body.externalPaymentReference.trim():undefined,loanProviderId:typeof body.loanProviderId==='string'&&body.loanProviderId.trim()?body.loanProviderId.trim():undefined,loanReference:typeof body.loanReference==='string'&&body.loanReference.trim()?body.loanReference.trim():undefined,depositAmount:typeof body.depositAmount==='number'?body.depositAmount:undefined,financedAmount:typeof body.financedAmount==='number'?body.financedAmount:undefined,dueAt:typeof body.dueAt==='string'&&body.dueAt.trim()?body.dueAt.trim():undefined},idempotencyKey);
        json(res,201,{requestId,...result}); return;
      }

      if(req.method==='POST'&&pathname==='/v1/finance/payment-adjustments'){ const body=await readJson(req); const adjustmentType=requiredString(body,'adjustmentType'); if(adjustmentType!=='REPLACEMENT'&&adjustmentType!=='REVERSAL') throw new Error('adjustmentType must be REPLACEMENT or REVERSAL.'); const result=await adjustPayment(services,requestId,user.id,{paymentId:requiredString(body,'paymentId'),adjustmentType,replacementAmount:adjustmentType==='REPLACEMENT'?requiredNonNegativeNumber(body,'replacementAmount'):undefined,reason:requiredString(body,'reason'),approvalId:requiredString(body,'approvalId')},idempotencyKey); json(res,200,{requestId,...result}); return; }
      if(req.method==='POST'&&pathname==='/v1/finance/loan-providers'){ const body=await readJson(req); const result=await createLoanProvider(services,requestId,user.id,{providerCode:requiredString(body,'providerCode'),providerName:requiredString(body,'providerName'),contactReference:typeof body.contactReference==='string'?body.contactReference:undefined},idempotencyKey); json(res,201,{requestId,...result}); return; }
      const loanProviderArchive=req.method==='POST'?pathname.match(/^\/v1\/finance\/loan-providers\/([^/]+)\/archive$/):null;
      if(loanProviderArchive){ const result=await archiveLoanProvider(services,requestId,user.id,loanProviderArchive[1]!,idempotencyKey); json(res,200,{requestId,...result}); return; }

      if(req.method==='POST'&&pathname==='/v1/inventory/allocations'){
        const result=await requestInventoryAllocation(services,requestId,user.id,allocationCommand(await readJson(req)),idempotencyKey);
        json(res,201,{requestId,...result}); return;
      }

      const allocationMatch=req.method==='POST'?pathname.match(/^\/v1\/inventory\/allocations\/([^/]+)\/(approve|dispatch|receive|cancel|reject)$/):null;
      if(allocationMatch){
        const [,allocationId,action]=allocationMatch;
        if (!allocationId || !action) throw new Error('Allocation action is required.');
        if(action==='approve') await approveInventoryAllocation(services,requestId,user.id,allocationId,idempotencyKey);
        else if(action==='dispatch') await dispatchInventoryAllocation(services,requestId,user.id,allocationId,idempotencyKey);
        else if(action==='receive') await receiveInventoryAllocation(services,requestId,user.id,allocationId,idempotencyKey);
        else {
          const body=await readJson(req);
          await cancelInventoryAllocation(services,requestId,user.id,allocationId,action==='reject'?'REJECTED':'CANCELLED',requiredString(body,'reason'),idempotencyKey);
        }
        const status=action==='approve'?'APPROVED':action==='dispatch'?'IN_TRANSIT':action==='receive'?'RECEIVED':action.toUpperCase();
        json(res,200,{requestId,allocationId,status}); return;
      }

      if(req.method==='POST'&&pathname==='/v1/inventory/returns'){
        const body=await readJson(req);
        const result=await returnInventoryToWarehouse(services,requestId,user.id,{imeiId:requiredString(body,'imeiId'),warehouseId:requiredString(body,'warehouseId'),reason:requiredString(body,'reason'),approvalId:typeof body.approvalId==='string'&&body.approvalId.trim()?body.approvalId.trim():undefined},idempotencyKey);
        json(res,200,{requestId,status:'RETURNED',...result}); return;
      }

      if(req.method==='POST'&&pathname==='/v1/inventory/corrections'){
        const body=await readJson(req);
        const movementType=body.movementType==='WRITE_OFF'?'WRITE_OFF':'ADJUSTMENT';
        const targetState=requiredImeiState(body,'targetState');
        const result=await executeApprovedInventoryCorrection(services,requestId,user.id,{
          imeiId:requiredString(body,'imeiId'),
          approvalId:requiredString(body,'approvalId'),
          targetState,
          targetHolderUserId:typeof body.targetHolderUserId==='string'&&body.targetHolderUserId.trim()?body.targetHolderUserId.trim():undefined,
          targetWarehouseId:typeof body.targetWarehouseId==='string'&&body.targetWarehouseId.trim()?body.targetWarehouseId.trim():undefined,
          targetRegionId:typeof body.targetRegionId==='string'&&body.targetRegionId.trim()?body.targetRegionId.trim():undefined,
          targetTeamId:typeof body.targetTeamId==='string'&&body.targetTeamId.trim()?body.targetTeamId.trim():undefined,
          targetShopId:typeof body.targetShopId==='string'&&body.targetShopId.trim()?body.targetShopId.trim():undefined,
          reason:requiredString(body,'reason'),
          movementType,
        },idempotencyKey);
        json(res,200,{requestId,status:'EXECUTED',...result}); return;
      }

      const reverseMatch=req.method==='POST'?pathname.match(/^\/v1\/sales\/([^/]+)\/reverse$/):null;
      if(reverseMatch){
        const body=await readJson(req);
        const reason=requiredString(body,'reason');
        const saleId=reverseMatch[1];
        if (!saleId) throw new Error('saleId is required.');
        await reverseSale(services,requestId,user.id,saleId,reason,idempotencyKey);
        json(res,200,{requestId,saleId:reverseMatch[1],status:'REVERSED'}); return;
      }


      if(req.method==='GET'&&pathname==='/v1/aging/policies'){
        const items=await listAgingPolicies(services,requestId,user.id); json(res,200,{requestId,items}); return;
      }
      if(req.method==='POST'&&pathname==='/v1/aging/policies'){
        const body=await readJson(req);
        const bandConfig=body.bandConfig && typeof body.bandConfig==='object' && !Array.isArray(body.bandConfig) ? body.bandConfig as Record<string,unknown> : undefined;
        const suspensionConfig=body.suspensionConfig && typeof body.suspensionConfig==='object' && !Array.isArray(body.suspensionConfig) ? body.suspensionConfig as Record<string,unknown> : undefined;
        const result=await createAgingPolicy(services,requestId,user.id,{policyName:requiredString(body,'policyName'),maximumDays:Number(body.maximumDays),warningDays:Number(body.warningDays),criticalOverdueDays:Number(body.criticalOverdueDays),effectiveFrom:requiredString(body,'effectiveFrom'),effectiveTo:typeof body.effectiveTo==='string'&&body.effectiveTo.trim()?body.effectiveTo.trim():undefined,bandConfig,suspensionConfig,autoRecoveryEnabled:typeof body.autoRecoveryEnabled==='boolean'?body.autoRecoveryEnabled:true},idempotencyKey);
        json(res,201,{requestId,...result,status:'ACTIVE'}); return;
      }

      if(req.method==='GET'&&pathname==='/v1/aging/queue'){
        const url=new URL(req.url ?? '/',`http://${req.headers.host ?? 'localhost'}`);
        const rawStatus=url.searchParams.get('status'); const status=rawStatus && ['GREEN','ORANGE','RED','PURPLE'].includes(rawStatus)?rawStatus as any:undefined;
        const limit=Number(url.searchParams.get('limit')??100);
        const items=await listAgingQueue(services,requestId,user.id,{status,regionId:url.searchParams.get('regionId')??undefined,teamId:url.searchParams.get('teamId')??undefined,holderUserId:url.searchParams.get('holderUserId')??undefined,criticalOnly:url.searchParams.get('criticalOnly')==='true',limit:Number.isFinite(limit)?limit:100});
        json(res,200,{requestId,items}); return;
      }
      if(req.method==='GET'&&pathname==='/v1/recovery/cases'){
        const url=new URL(req.url ?? '/',`http://${req.headers.host ?? 'localhost'}`); const limit=Number(url.searchParams.get('limit')??100);
        const items=await listRecoveryQueue(services,requestId,user.id,Number.isFinite(limit)?limit:100); json(res,200,{requestId,items}); return;
      }
      if(req.method==='GET'&&pathname==='/v1/recovery/suspensions'){
        const items=await listRecoverySuspensions(services,requestId,user.id,true,100); json(res,200,{requestId,items}); return;
      }
      const recoveryGetMatch=req.method==='GET'?pathname.match(/^\/v1\/recovery\/cases\/([^/]+)$/):null;
      if(recoveryGetMatch){ const item=await getRecoveryCase(services,requestId,user.id,recoveryGetMatch[1]!); json(res,200,{requestId,item}); return; }

      if(req.method==='POST'&&pathname==='/v1/recovery/cases'){
        const body=await readJson(req);
        const caseId=await createRecoveryCase(services,requestId,user.id,{imeiId:requiredString(body,'imeiId'),customerId:typeof body.customerId==='string'&&body.customerId.trim()?body.customerId.trim():undefined,reason:requiredString(body,'reason'),priority:typeof body.priority==='number'?body.priority:undefined,dueAt:typeof body.dueAt==='string'&&body.dueAt.trim()?body.dueAt.trim():undefined,notes:typeof body.notes==='string'&&body.notes.trim()?body.notes.trim():undefined},idempotencyKey);
        json(res,201,{requestId,caseId,status:'OPEN'}); return;
      }

      const recoveryMatch=req.method==='POST'?pathname.match(/^\/v1\/recovery\/cases\/([^/]+)\/(assign|activity|accept|close|reassign)$/):null;
      if(recoveryMatch){
        const [,caseId,action]=recoveryMatch;
        if(!caseId||!action) throw new Error('Recovery case action is required.');
        const body=await readJson(req);
        if(action==='assign'){
          await assignRecoveryCase(services,requestId,user.id,{caseId,officerUserId:requiredString(body,'officerUserId')},idempotencyKey);
          json(res,200,{requestId,caseId,status:'ASSIGNED'}); return;
        }
        if(action==='reassign'){
          await reassignRecoveryCase(services,requestId,user.id,caseId,requiredString(body,'officerUserId'),requiredString(body,'reason'),idempotencyKey);
          json(res,200,{requestId,caseId,status:'REASSIGNED'}); return;
        }
        if(action==='activity'){
          const activityType=requiredString(body,'activityType');
          const allowed=['CONTACTED','VISITED','PROMISE_TO_RETURN','FAILED_ATTEMPT','RECOVERED','ESCALATED'] as const;
          if(!allowed.includes(activityType as typeof allowed[number])) throw new Error('Unsupported recovery activity type.');
          const activityId=await addRecoveryActivity(services,requestId,user.id,{caseId,activityType:activityType as typeof allowed[number],result:typeof body.result==='string'?body.result.trim():undefined,verifiedImei:typeof body.verifiedImei==='string'?body.verifiedImei.trim():undefined,notes:typeof body.notes==='string'?body.notes.trim():undefined},idempotencyKey);
          json(res,201,{requestId,caseId,activityId}); return;
        }
        if(action==='accept'){
          await acceptRecoveredStock(services,requestId,user.id,{caseId,warehouseId:requiredString(body,'warehouseId'),scannedImei:requiredString(body,'scannedImei')},idempotencyKey);
          json(res,200,{requestId,caseId,status:'RECOVERED'}); return;
        }
        await closeRecoveryCase(services,requestId,user.id,caseId,requiredString(body,'reason'),idempotencyKey);
        json(res,200,{requestId,caseId,status:'CLOSED'}); return;
      }

      const suspensionReinstateMatch=req.method==='POST'?pathname.match(/^\/v1\/recovery\/suspensions\/([^/]+)\/reinstate$/):null;
      if(suspensionReinstateMatch){
        const body=await readJson(req); await reinstateSuspendedUser(services,requestId,user.id,suspensionReinstateMatch[1]!,requiredString(body,'reason'),idempotencyKey);
        json(res,200,{requestId,userId:suspensionReinstateMatch[1],status:'REINSTATED'}); return;
      }

      if(req.method==='POST'&&pathname==='/v1/approvals'){
        const body=await readJson(req);
        const requestedChanges=body.requestedChanges;
        if(!requestedChanges||typeof requestedChanges!=='object'||Array.isArray(requestedChanges)) throw new Error('requestedChanges object is required.');
        const approvalType=requiredString(body,'approvalType');
        const approvalId=await createApprovalRequest(services,requestId,user.id,{approvalType: approvalType as ApprovalType,targetType:requiredString(body,'targetType'),targetId:requiredString(body,'targetId'),requestedChanges:requestedChanges as Record<string,unknown>,reason:requiredString(body,'reason')},idempotencyKey);
        json(res,201,{requestId,approvalId,status:'PENDING'}); return;
      }

      const approvalMatch=req.method==='POST'?pathname.match(/^\/v1\/approvals\/([^/]+)\/decision$/):null;
      if(approvalMatch){
        const body=await readJson(req);
        const decision=requiredString(body,'decision');
        if(decision!=='APPROVED'&&decision!=='REJECTED') throw new Error('decision must be APPROVED or REJECTED.');
        const approvalId=approvalMatch[1];
        if (!approvalId) throw new Error('approvalId is required.');
        await decideApproval(services,requestId,user.id,approvalId,decision,requiredString(body,'reason'),idempotencyKey);
        json(res,200,{requestId,approvalId:approvalMatch[1],status:decision}); return;
      }

      json(res,404,{error:'NOT_FOUND',requestId});
    } catch(error) {
      if(error instanceof MfaError){ json(res,error.status,{error:error.code,message:error.message,requestId}); return; }
      if(error instanceof SetupError){ json(res,error.status,{error:error.code,message:error.message,requestId}); return; }
      if(error instanceof AuthenticationError){ json(res,401,{error:'AUTHENTICATION_REQUIRED',message:error.message,requestId}); return; }
      if(error instanceof DomainError){ const status=domainStatus(error); json(res,status,{error:error.code,message:error.message,requestId}); return; }
      const message=error instanceof Error?error.message:'Internal server error.';
      const status=message.includes('required')||message.includes('Unsupported')||message.includes('must be')?400:500;
      json(res,status,{error:status===500?'INTERNAL_SERVER_ERROR':'REQUEST_REJECTED',message:status===500?'Request could not be completed.':message,requestId});
    }
  });
  const closeRealtime = installRealtimeServer(server, services);
  server.on('close', () => { void closeRealtime().catch(() => undefined); void services.pool.end().catch(() => undefined); });
  return server;
}

const shouldAutostart = process.env.AMAAL_API_AUTOSTART === 'true' || (process.env.AMAAL_API_AUTOSTART !== 'false' && Boolean(process.env.PORT));
if(shouldAutostart){
  const port=Number(process.env.PORT??3000);
  const server = createApiServer();
  const shutdown = () => server.close(() => process.exit(0));
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  server.listen(port,'0.0.0.0',()=>console.log(`Amaal API listening on ${port}`));
}
