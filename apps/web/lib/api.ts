import { authClient, getMfaAssertion } from './auth';

function apiBase(): string {
  if (typeof window === 'undefined') {
    const serverValue = process.env.AMAAL_BACKEND_URL?.trim() || process.env.NEXT_PUBLIC_AMAAL_API_URL?.trim() || 'https://amaal-api.onrender.com';
    return serverValue.replace(/\/$/, '');
  }
  return '/api/amaal';
}

function friendlyResponseError(status: number, raw: string): string {
  if (status === 401) return 'Your sign-in has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) return 'We could not find what you were looking for.';
  if (status === 409) return 'That information has changed. Please refresh and try again.';
  if (status === 429) return 'There have been too many attempts. Please wait a moment and try again.';
  if (status >= 500) return 'We could not complete that request right now. Please try again.';
  if (!raw || /\b(?:SQL|API|SDK|endpoint|serverless|TypeScript|JavaScript|JSON|schema|query|uuid|ECONN|Neon Auth|internal server|request id)\b/i.test(raw)) {
    return 'We could not complete that request. Please check the information and try again.';
  }
  return raw;
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const raw = await response.text();
  let payload: (T & { message?: string; error?: string }) | null = null;
  try {
    payload = raw ? JSON.parse(raw) as T & { message?: string; error?: string } : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload?.message || payload?.error || '';
    throw new Error(friendlyResponseError(response.status, detail));
  }
  if (!payload) throw new Error('We could not read that response. Please try again.');
  return payload;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tokenResponse = await authClient.token();
  const token = tokenResponse.data?.token ?? null;
  if (!token) throw new Error('A secure session is required.');

  const mfaAssertion = getMfaAssertion();
  return fetchJson<T>(path, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(mfaAssertion ? { 'x-amaal-mfa-assertion': mfaAssertion } : {}),
      ...(init.headers ?? {}),
    },
  });
}

export type AmaalSetupStatus = {
  stage: 'NOT_STARTED' | 'ORGANIZATION_READY' | 'ACTIVATED';
  setupRequired: boolean;
  organization: {
    id: string;
    name: string;
  };
  readiness: {
    organization: boolean;
    masterWarehouse: boolean;
    mainRegions: boolean;
    regionalWarehouses: boolean;
    pendingCeo: boolean;
    policyReadinessRecorded: boolean;
    locked: boolean;
  };
  masterWarehouse: {
    id: string;
    code: string;
    name: string;
  } | null;
  regions: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  pendingCeo: {
    email: string;
    displayName: string;
    employeeNumber: string | null;
  } | null;
};

export async function getSetupStatus(): Promise<AmaalSetupStatus> {
  return fetchJson<AmaalSetupStatus>('/v1/setup/status');
}

export type SetupInitializeInput = {
  activationCode: string;
  ceoEmail: string;
  ceoDisplayName: string;
  ceoEmployeeNumber?: string;
  regions: Array<{ code: string; name: string }>;
  regionalWarehouses: Array<{ code: string; name: string; regionCode: string }>;
};

export type SetupInitializeResult = {
  requestId: string;
  organizationId: string;
  stage: 'ORGANIZATION_READY';
  regionIds: string[];
  warehouseIds: string[];
};

export async function initializeAmaal(input: SetupInitializeInput): Promise<SetupInitializeResult> {
  return fetchJson<SetupInitializeResult>('/v1/setup/initialize', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function publicHealth(): Promise<{ ok: boolean; service: string }> {
  const payload = await fetchJson<{ ok: boolean; service: string }>('/health');
  return payload;
}

export type ApiReadiness = {
  ok: boolean;
  ready: boolean;
  service: string;
  checks: {
    database: 'ok' | 'failed';
  };
};

export async function publicReady(): Promise<ApiReadiness> {
  const response = await fetch(`${apiBase()}/ready`, { cache: 'no-store' });
  const payload = (await response.json()) as ApiReadiness;
  if (!response.ok && !payload) throw new Error(`Amaal readiness check failed with ${response.status}.`);
  return payload;
}


export type OrganizationInvitationPreview = {
  email: string;
  displayName: string;
  role: string;
  expiresAt: string;
};

export async function getOrganizationInvitationPreview(token: string): Promise<OrganizationInvitationPreview> {
  return fetchJson<OrganizationInvitationPreview>(`/v1/org/invitations/preview?token=${encodeURIComponent(token)}`);
}

export async function acceptOrganizationInvitation(token: string) {
  return apiFetch<{ status: 'ACCEPTED'; invitationId: string; userId: string; role: string }>('/v1/org/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export type Customer = {
  id:string; customerNumber:string; fullName:string; phone:string; alternativePhone:string|null; email:string|null; address:string|null;
  customerType:string|null; identityReference:string|null; consentStatus:string|null; ownerUserId:string; ownerName:string|null;
  regionId:string|null; regionName:string|null; subregionId:string|null; subregionName:string|null; teamId:string|null; teamName:string|null; shopId:string|null; shopName:string|null;
  createdAt:string; updatedAt:string;
};

export async function listCustomersApi(q='') { return apiFetch<{items:Customer[]}>(`/v1/customers?q=${encodeURIComponent(q)}`); }
export async function createCustomerApi(input:Partial<Customer> & {fullName:string;phone:string}) { return apiFetch<{id:string;customerNumber:string}>('/v1/customers',{method:'POST',body:JSON.stringify(input),headers:{'x-idempotency-key':crypto.randomUUID()}}); }
export async function updateCustomerApi(customerId:string,input:Record<string,unknown>) { return apiFetch<{item:Customer}>(`/v1/customers/${encodeURIComponent(customerId)}/update`,{method:'POST',body:JSON.stringify(input),headers:{'x-idempotency-key':crypto.randomUUID()}}); }
export async function assignCustomerApi(customerId:string,newOwnerUserId:string,reason:string) { return apiFetch<{id:string;ownerUserId:string}>(`/v1/customers/assign`,{method:'POST',body:JSON.stringify({customerId,newOwnerUserId,reason}),headers:{'x-idempotency-key':crypto.randomUUID()}}); }

export type Sale = { id:string; saleNumber:string; saleDate:string; status:string; paymentType:'CASH'|'LOAN'; subtotal:number; discountAmount:number; totalAmount:number; amountPaid:number; balance:number; sellerUserId:string; sellerName:string; customerId:string; customerNumber:string; customerName:string; teamName:string|null; managerName:string|null; regionName:string|null; loanProviderName:string|null; loanReference:string|null; externalReference:string|null; };
export async function listSalesApi(options:{q?:string;from?:string;to?:string;paymentType?:string}={}) { const qs=new URLSearchParams(); for(const [k,v] of Object.entries(options)){ if(v) qs.set(k,v); } return apiFetch<{items:Sale[]}>(`/v1/sales?${qs.toString()}`); }
export async function getSaleApi(id:string) { return apiFetch<{item:Sale & {customerPhone:string|null;customerEmail:string|null;depositAmount:number;financedAmount:number;items:Array<{saleItemId:string;imeiId:string;imei:string;imei2:string|null;brandName:string;modelName:string;sku:string;listPrice:number;discountAmount:number;finalPrice:number;lineTotal:number;commissionAmount:number;priceSnapshot:Record<string,unknown>}>;payments:Array<Record<string,unknown>>}}>(`/v1/sales/${encodeURIComponent(id)}`); }
export async function createSaleApi(input:Record<string,unknown>) { return apiFetch<Record<string,unknown>>('/v1/sales',{method:'POST',body:JSON.stringify(input),headers:{'x-idempotency-key':crypto.randomUUID()}}); }

export type Commission = { commissionId:string; saleId:string; saleNumber:string; beneficiaryUserId:string; beneficiaryName:string; beneficiaryRole:string; amount:number; status:string; createdAt:string; policyId:string|null; policySnapshot:Record<string,unknown>; saleDate:string; teamName:string|null; regionName:string|null; };
export async function listCommissionsApi(options:{from?:string;to?:string;userId?:string;role?:string}={}) { const qs=new URLSearchParams(); for(const [k,v] of Object.entries(options)){ if(v) qs.set(k,v); } return apiFetch<{items:Commission[]}>(`/v1/finance/commissions?${qs.toString()}`); }
export async function listBonusesApi() { return apiFetch<{items:Array<Record<string,unknown>>}>('/v1/finance/bonuses'); }
export async function listReceiptsApi() { return apiFetch<{items:Array<Record<string,unknown>>}>('/v1/finance/receipts'); }
export async function listLoanProvidersApi() { return apiFetch<{items:Array<{id:string;providerCode:string;providerName:string;contactReference:string|null;status:string}>}>('/v1/finance/loan-providers'); }
export async function createLoanProviderApi(input:{providerCode:string;providerName:string;contactReference?:string}) { return apiFetch<{id:string}>('/v1/finance/loan-providers',{method:'POST',body:JSON.stringify(input),headers:{'x-idempotency-key':crypto.randomUUID()}}); }
export async function createCommissionPolicyApi(input:Record<string,unknown>) { return apiFetch<{id:string}>('/v1/finance/commission-policies',{method:'POST',body:JSON.stringify(input),headers:{'x-idempotency-key':crypto.randomUUID()}}); }
export async function createBonusPolicyApi(input:Record<string,unknown>) { return apiFetch<{id:string}>('/v1/finance/bonus-policies',{method:'POST',body:JSON.stringify(input),headers:{'x-idempotency-key':crypto.randomUUID()}}); }
export async function listCommissionPoliciesApi() { return apiFetch<{items:Array<Record<string,unknown>>}>('/v1/finance/commission-policies'); }
export async function listBonusPoliciesApi() { return apiFetch<{items:Array<Record<string,unknown>>}>('/v1/finance/bonus-policies'); }
export async function listPaymentAdjustmentsApi(paymentId?:string) { const qs=paymentId?`?paymentId=${encodeURIComponent(paymentId)}`:''; return apiFetch<{items:Array<Record<string,unknown>>}>(`/v1/finance/payment-adjustments${qs}`); }
export async function adjustPaymentApi(input:Record<string,unknown>) { return apiFetch<Record<string,unknown>>('/v1/finance/payment-adjustments',{method:'POST',body:JSON.stringify(input),headers:{'x-idempotency-key':crypto.randomUUID()}}); }

export type AgingPolicy = { id:string; organizationId:string; policyName:string; maximumDays:number; warningDays:number; criticalOverdueDays:number; effectiveFrom:string; effectiveTo:string|null; status:string; bandConfig:Record<string,unknown>; suspensionConfig:Record<string,unknown>; autoRecoveryEnabled:boolean; createdAt:string };
export async function listAgingPoliciesApi(){ return apiFetch<{items:AgingPolicy[]}>('/v1/aging/policies'); }
export async function createAgingPolicyApi(input:Record<string,unknown>){ return apiFetch<{id:string;status:string}>('/v1/aging/policies',{method:'POST',body:JSON.stringify(input),headers:{'x-idempotency-key':crypto.randomUUID()}}); }

export type AgingQueueItem = { imeiId:string; imei:string; imei2:string|null; agingStatus:'GREEN'|'ORANGE'|'RED'|'PURPLE'; totalFieldAgeDays:number; currentHolderAgeDays:number; daysRemaining:number; daysOverdue:number; isWarning:boolean; isOverdue:boolean; isCritical:boolean; holderUserId:string|null; holderName:string|null; teamId:string|null; teamName:string|null; regionId:string|null; regionName:string|null; shopId:string|null; shopName:string|null; recoveryCaseId:string|null; recoveryStatus:string|null; };
export async function listAgingQueueApi(options:{status?:string;regionId?:string;teamId?:string;holderUserId?:string;criticalOnly?:boolean}={}){const qs=new URLSearchParams();for(const[k,v]of Object.entries(options)){if(v!==undefined&&v!=='')qs.set(k,String(v));}return apiFetch<{items:AgingQueueItem[]}>(`/v1/aging/queue?${qs.toString()}`);}
export async function listRecoveryQueueApi(){return apiFetch<{items:Array<Record<string,unknown>>}>('/v1/recovery/cases');}
export async function getRecoveryCaseApi(caseId:string){return apiFetch<{item:Record<string,unknown>}>(`/v1/recovery/cases/${encodeURIComponent(caseId)}`);}
export async function assignRecoveryCaseApi(caseId:string,officerUserId:string){return apiFetch<Record<string,unknown>>(`/v1/recovery/cases/${encodeURIComponent(caseId)}/assign`,{method:'POST',body:JSON.stringify({officerUserId}),headers:{'x-idempotency-key':crypto.randomUUID()}});}
export async function reassignRecoveryCaseApi(caseId:string,officerUserId:string,reason:string){return apiFetch<Record<string,unknown>>(`/v1/recovery/cases/${encodeURIComponent(caseId)}/reassign`,{method:'POST',body:JSON.stringify({officerUserId,reason}),headers:{'x-idempotency-key':crypto.randomUUID()}});}
export async function addRecoveryActivityApi(caseId:string,input:Record<string,unknown>){return apiFetch<Record<string,unknown>>(`/v1/recovery/cases/${encodeURIComponent(caseId)}/activity`,{method:'POST',body:JSON.stringify(input),headers:{'x-idempotency-key':crypto.randomUUID()}});}
export async function acceptRecoveredStockApi(caseId:string,warehouseId:string,scannedImei:string){return apiFetch<Record<string,unknown>>(`/v1/recovery/cases/${encodeURIComponent(caseId)}/accept`,{method:'POST',body:JSON.stringify({warehouseId,scannedImei}),headers:{'x-idempotency-key':crypto.randomUUID()}});}
export async function closeRecoveryCaseApi(caseId:string,reason:string){return apiFetch<Record<string,unknown>>(`/v1/recovery/cases/${encodeURIComponent(caseId)}/close`,{method:'POST',body:JSON.stringify({reason}),headers:{'x-idempotency-key':crypto.randomUUID()}});}
export async function listRecoverySuspensionsApi(){return apiFetch<{items:Array<Record<string,unknown>>}>('/v1/recovery/suspensions');}
export async function reinstateSuspendedUserApi(userId:string,reason:string){return apiFetch<Record<string,unknown>>(`/v1/recovery/suspensions/${encodeURIComponent(userId)}/reinstate`,{method:'POST',body:JSON.stringify({reason}),headers:{'x-idempotency-key':crypto.randomUUID()}});}


export type OperationalReportOptions = {
  period?: 'TODAY' | 'WEEK' | 'MONTH' | '3M' | '6M' | '12M';
  comparison?: 'AGENT' | 'TEAM' | 'MANAGER' | 'REGION';
  regionId?: string;
  teamId?: string;
};

export async function getOperationalReportApi(options: OperationalReportOptions = {}) {
  const qs = new URLSearchParams();
  qs.set('period', options.period ?? 'MONTH');
  qs.set('comparison', options.comparison ?? 'TEAM');
  if (options.regionId) qs.set('regionId', options.regionId);
  if (options.teamId) qs.set('teamId', options.teamId);
  return apiFetch<any>(`/v1/reports/operational?${qs.toString()}`);
}

export async function exportOperationalReportCsvApi(options: OperationalReportOptions = {}): Promise<{ filename: string; csv: string }> {
  const tokenResponse = await authClient.token();
  const token = tokenResponse.data?.token ?? null;
  if (!token) throw new Error('A secure session is required.');
  const qs = new URLSearchParams();
  qs.set('period', options.period ?? 'MONTH');
  qs.set('comparison', options.comparison ?? 'TEAM');
  if (options.regionId) qs.set('regionId', options.regionId);
  if (options.teamId) qs.set('teamId', options.teamId);
  const mfaAssertion = getMfaAssertion();
  const response = await fetch(`${apiBase()}/v1/reports/operational.csv?${qs.toString()}`, {
    cache: 'no-store',
    headers: {
      authorization: `Bearer ${token}`,
      ...(mfaAssertion ? { 'x-amaal-mfa-assertion': mfaAssertion } : {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    try {
      const payload = JSON.parse(text) as { message?: string; error?: string };
      throw new Error(payload.message || payload.error || `Report export failed with ${response.status}.`);
    } catch (error) {
      if (error instanceof Error && error.message !== text) throw error;
      throw new Error(`Report export failed with ${response.status}.`);
    }
  }
  const contentDisposition = response.headers.get('content-disposition') ?? '';
  const match = contentDisposition.match(/filename="?([^";]+)"?/i);
  return { filename: match?.[1] ?? 'amaal-operational-report.csv', csv: text };
}

export type AmaalAIStatus = {
  enabled: boolean;
  configured: boolean;
  provider: 'openai' | 'none';
  model: string | null;
  maxToolRounds: number;
  governedTools: number;
  governanceVersion: string;
  toolPolicyVersion: string;
};

export type AmaalAIRoute = {
  intent: string;
  agent: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  candidateTools: string[];
  rationale: string;
};

export type AmaalAIToolEvidence = {
  tool: string;
  agent: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  authorization: string;
  actionPlanId?: string;
  classification?: string;
};

export type AmaalAIChatResult = {
  conversationId: string;
  message: string;
  provider: string;
  model: string | null;
  mode: 'LIVE' | 'FOUNDATION';
  route: AmaalAIRoute;
  evidence: AmaalAIToolEvidence[];
  actionPlanIds: string[];
};

export type AmaalAIActionPlan = {
  id: string;
  conversationId: string | null;
  toolName: string;
  riskLevel: 'HIGH' | 'CRITICAL';
  autonomyLevel: number;
  summary: string;
  arguments: Record<string, unknown>;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'EXPIRED' | 'CANCELLED' | string;
  approvalId: string | null;
  executedTargetId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
};

export type AmaalAIAwaitingApproval = {
  approvalId: string;
  planId: string;
  requestedBy: string;
  toolName: string;
  riskLevel: 'HIGH' | 'CRITICAL';
  summary: string;
  reason: string;
  createdAt: string;
};

export async function getAmaalAIStatusApi() {
  return apiFetch<AmaalAIStatus>('/v1/ai/status');
}

export async function chatAmaalAIApi(input: { message: string; conversationId?: string }) {
  return apiFetch<AmaalAIChatResult>('/v1/ai/chat', { method: 'POST', body: JSON.stringify(input) });
}

export async function createAmaalAIConversationApi(title?: string) {
  return apiFetch<{ conversation: { id: string } }>('/v1/ai/conversations', {
    method: 'POST',
    body: JSON.stringify(title ? { title } : {}),
  });
}

export async function listAmaalAIActionPlansApi() {
  return apiFetch<{ items: AmaalAIActionPlan[] }>('/v1/ai/action-plans');
}

export async function listAmaalAIAwaitingApprovalsApi() {
  return apiFetch<{ items: AmaalAIAwaitingApproval[] }>('/v1/ai/approvals');
}

export async function decideAmaalAIAwaitingApprovalApi(approvalId: string, decision: 'APPROVED'|'REJECTED', reason: string) {
  return apiFetch<{ approvalId: string; planId: string; status: 'APPROVED'|'REJECTED' }>(`/v1/ai/approvals/${encodeURIComponent(approvalId)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision, reason }),
  });
}

export async function submitAmaalAIActionPlanApi(planId: string, reason: string) {
  return apiFetch<{ planId: string; approvalId: string; status: 'PENDING_APPROVAL' }>(`/v1/ai/action-plans/${encodeURIComponent(planId)}/submit`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function executeAmaalAIRecoveryPlanApi(planId: string) {
  return apiFetch<{ planId: string; targetId: string; status: 'EXECUTED' }>(`/v1/ai/action-plans/${encodeURIComponent(planId)}/execute`, {
    method: 'POST',
    body: '{}',
  });
}

export type AmaalIntelligencePrediction = {
  id: string;
  model_key: string;
  model_version: string;
  prediction_kind: string;
  entity_type: string;
  entity_id: string;
  region_id: string | null;
  team_id: string | null;
  seller_user_id: string | null;
  product_variant_id: string | null;
  as_of_date: string;
  status: 'PREDICTED'|'INSUFFICIENT_HISTORY'|'SHADOW'|'BLOCKED';
  value: unknown;
  confidence: number | null;
  explanation: unknown;
  feature_schema_version: string;
  governance_version: string;
  updated_at: string;
};

export type AmaalIntelligenceStatus = {
  requestId?: string;
  featureSchemaVersion: string;
  governanceVersion: string;
  mode: 'FOUNDATION_ONLY'|'SHADOW_READY';
  modelRegistryInstalled: boolean;
  predictionsInstalled: boolean;
  totals: { predictions: number; shadow: number; predicted: number };
  latestPredictionAt: string | null;
  activation: string;
};

export async function getAmaalIntelligenceStatusApi() {
  return apiFetch<AmaalIntelligenceStatus>('/v1/intelligence/status');
}

export async function getAmaalIntelligenceSummaryApi() {
  return apiFetch<AmaalIntelligenceStatus & { sections: Record<string, AmaalIntelligencePrediction[]> }>('/v1/intelligence/summary');
}

export async function listAmaalIntelligencePredictionsApi(kind?: string, limit = 20) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (kind) query.set('kind', kind);
  return apiFetch<{ mode: 'FOUNDATION_ONLY'|'SHADOW_READY'; items: AmaalIntelligencePrediction[] }>(`/v1/intelligence/predictions?${query.toString()}`);
}
