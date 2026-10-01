import { authClient, getMfaAssertion } from './auth';

function apiBase(): string {
  const value = process.env.NEXT_PUBLIC_AMAAL_API_URL;
  if (!value) throw new Error('Amaal is not configured yet.');
  return value.replace(/\/$/, '');
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
  const payload = (await response.json()) as T & { message?: string; error?: string };
  if (!response.ok) throw new Error(payload.message || payload.error || `Request failed with ${response.status}.`);
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
