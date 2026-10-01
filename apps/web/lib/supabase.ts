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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 65000);
    let response: Response;
    try {
      response = await fetch(`${apiBase()}/v1/auth/config`, { cache: 'no-store', signal: controller.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('The Amaal API did not respond within 65 seconds. Confirm the Render API is live.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
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
