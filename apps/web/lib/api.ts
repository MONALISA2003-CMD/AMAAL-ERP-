import { getSupabaseBrowserClient } from './supabase';

function apiBase(): string {
  const value = process.env.NEXT_PUBLIC_AMAAL_API_URL;
  if (!value) throw new Error('NEXT_PUBLIC_AMAAL_API_URL is not configured.');
  return value.replace(/\/$/, '');
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const supabase = await getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Authentication session is required.');

  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });
  const payload = (await response.json()) as T & { message?: string; error?: string };
  if (!response.ok) throw new Error(payload.message || payload.error || `Request failed with ${response.status}.`);
  return payload;
}

export async function publicHealth(): Promise<{ ok: boolean; service: string }> {
  const response = await fetch(`${apiBase()}/health`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`API health check failed with ${response.status}.`);
  return response.json();
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
  if (!response.ok && !payload) throw new Error(`API readiness check failed with ${response.status}.`);
  return payload;
}
