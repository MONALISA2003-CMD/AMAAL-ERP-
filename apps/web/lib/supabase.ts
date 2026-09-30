import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let clientPromise: Promise<SupabaseClient> | null = null;

function apiBase(): string {
  const value = process.env.NEXT_PUBLIC_AMAAL_API_URL?.trim();
  if (!value) throw new Error('NEXT_PUBLIC_AMAAL_API_URL is not configured.');
  return value.replace(/\/$/, '');
}

export async function getSupabaseBrowserClient(): Promise<SupabaseClient> {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    const response = await fetch(`${apiBase()}/v1/auth/config`, { cache: 'no-store' });
    const payload = (await response.json()) as { supabaseUrl?: string; supabasePublishableKey?: string; message?: string };
    if (!response.ok || !payload.supabaseUrl || !payload.supabasePublishableKey) {
      throw new Error(payload.message || `Authentication configuration failed with ${response.status}.`);
    }
    return createClient(payload.supabaseUrl, payload.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  })().catch((error) => {
    clientPromise = null;
    throw error;
  });
  return clientPromise;
}
