import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createAuthClient, authenticateBearerToken, AuthenticationError } from '@amaal/auth';
import { DomainError } from '@amaal/shared';
import type { ImeiState } from '@amaal/business-rules';
import { loadAuthorizationContext } from '@amaal/permissions';
import type { ApprovalType } from '@amaal/approvals';
import {
  approveInventoryAllocation,
  cancelInventoryAllocation,
  completeCashSale,
  createApiServices,
  createApprovalRequest,
  checkDatabaseReadiness,
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
  if (method === 'GET' && (pathname === '/v1/me' || pathname === '/v1/me/scope')) return true;
  if (method === 'POST' && (pathname === '/v1/sales/cash' || pathname === '/v1/inventory/allocations' || pathname === '/v1/inventory/returns' || pathname === '/v1/inventory/corrections' || pathname === '/v1/recovery/cases' || pathname === '/v1/approvals')) return true;
  if (method !== 'POST') return false;
  return /^\/v1\/(?:sales\/[^/]+\/reverse|inventory\/allocations\/[^/]+\/(?:approve|dispatch|receive|cancel|reject)|recovery\/cases\/[^/]+\/(?:assign|activity|accept|close)|approvals\/[^/]+\/decision)$/.test(pathname);
}

function isMfaEnforced(): boolean {
  const raw = process.env.AMAAL_MFA_ENFORCED?.trim().toLowerCase();
  return raw !== 'false';
}

export function createApiServer() {
  const services = createApiServices();
  const authClient = createAuthClient();
  const mfaEnforced = isMfaEnforced();
  const server = createServer(async (req,res) => {
    const requestId=req.headers['x-request-id']?.toString()||randomUUID();
    res.setHeader('x-request-id',requestId);
    const allowedOrigin = process.env.AMAAL_WEB_ORIGIN?.trim();
    if (allowedOrigin) {
      res.setHeader('access-control-allow-origin', allowedOrigin);
      res.setHeader('access-control-allow-headers', 'authorization,content-type,x-request-id,x-idempotency-key');
      res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
      res.setHeader('vary', 'Origin');
    }
    try {
      if(req.method==='OPTIONS'){ res.statusCode=204; res.end(); return; }
      const pathname = requestPath(req);
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
      const authorizationHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
      const user = await authenticateBearerToken(authClient,authorizationHeader);

      if(req.method==='GET'&&(pathname==='/v1/me'||pathname==='/v1/me/scope')){
        const scope = await services.transactions.withTransaction({requestId,actorUserId:user.id}, async (tx) => loadAuthorizationContext(tx,user.id));
        const privileged = scope.roles.includes('CEO') || scope.roles.includes('ADMIN');
        const mfaRequired = privileged && mfaEnforced;
        if(pathname==='/v1/me/scope'){ json(res,200,{requestId,authorization:scope,authenticatorAssuranceLevel:user.aal,mfaRequired}); return; }
        json(res,200,{requestId,user:{id:user.id,email:user.email},authorization:scope,authenticatorAssuranceLevel:user.aal,mfaRequired: mfaRequired && user.aal !== 'aal2'}); return;
      }

      const context = await services.transactions.withTransaction({requestId,actorUserId:user.id}, async (tx) => loadAuthorizationContext(tx,user.id));
      if (mfaEnforced && (context.roles.includes('CEO') || context.roles.includes('ADMIN')) && user.aal !== 'aal2') {
        json(res,403,{error:'MFA_REQUIRED',message:'CEO and Admin ERP operations require verified multi-factor authentication.',requestId,mfaRequired:true});
        return;
      }
      const idempotencyKey = typeof req.headers['x-idempotency-key'] === 'string' ? req.headers['x-idempotency-key'].trim() || undefined : undefined;

      if(req.method==='POST'&&pathname==='/v1/sales/cash'){
        const body=await readJson(req);
        const result=await completeCashSale(services,requestId,user.id,{sellerUserId:user.id,customerId:requiredString(body,'customerId'),paymentType:'CASH',lines:[{imeiId:requiredString(body,'imeiId'),productVariantId:requiredString(body,'productVariantId'),unitPrice:requiredNumber(body,'unitPrice')}],...(typeof body.externalPaymentReference==='string'&&body.externalPaymentReference.trim()?{externalPaymentReference:body.externalPaymentReference.trim()}:{})},idempotencyKey);
        json(res,201,{requestId,...result}); return;
      }

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


      if(req.method==='POST'&&pathname==='/v1/recovery/cases'){
        const body=await readJson(req);
        const caseId=await createRecoveryCase(services,requestId,user.id,{imeiId:requiredString(body,'imeiId'),customerId:typeof body.customerId==='string'&&body.customerId.trim()?body.customerId.trim():undefined,reason:requiredString(body,'reason'),priority:typeof body.priority==='number'?body.priority:undefined,dueAt:typeof body.dueAt==='string'&&body.dueAt.trim()?body.dueAt.trim():undefined,notes:typeof body.notes==='string'&&body.notes.trim()?body.notes.trim():undefined},idempotencyKey);
        json(res,201,{requestId,caseId,status:'OPEN'}); return;
      }

      const recoveryMatch=req.method==='POST'?pathname.match(/^\/v1\/recovery\/cases\/([^/]+)\/(assign|activity|accept|close)$/):null;
      if(recoveryMatch){
        const [,caseId,action]=recoveryMatch;
        if(!caseId||!action) throw new Error('Recovery case action is required.');
        const body=await readJson(req);
        if(action==='assign'){
          await assignRecoveryCase(services,requestId,user.id,{caseId,officerUserId:requiredString(body,'officerUserId')},idempotencyKey);
          json(res,200,{requestId,caseId,status:'ASSIGNED'}); return;
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
      if(error instanceof AuthenticationError){ json(res,401,{error:'AUTHENTICATION_REQUIRED',message:error.message,requestId}); return; }
      if(error instanceof DomainError){ const status=domainStatus(error); json(res,status,{error:error.code,message:error.message,requestId}); return; }
      const message=error instanceof Error?error.message:'Internal server error.';
      const status=message.includes('required')||message.includes('Unsupported')||message.includes('must be')?400:500;
      json(res,status,{error:status===500?'INTERNAL_SERVER_ERROR':'REQUEST_REJECTED',message:status===500?'Request could not be completed.':message,requestId});
    }
  });
  server.on('close', () => { void services.pool.end().catch(() => undefined); });
  return server;
}

if(process.env.AMAAL_API_AUTOSTART==='true'){
  const port=Number(process.env.PORT??3000);
  const server = createApiServer();
  const shutdown = () => server.close(() => process.exit(0));
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  server.listen(port,'0.0.0.0',()=>console.log(`Amaal API listening on ${port}`));
}
