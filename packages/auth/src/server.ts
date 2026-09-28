import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  aal: 'aal1' | 'aal2';
}

export class AuthenticationError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export function createAuthClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required for server authentication.');
  }

  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function toAuthenticatedUser(user: User, aal: 'aal1' | 'aal2'): AuthenticatedUser {
  return { id: user.id, email: user.email ?? null, aal };
}

export async function authenticateBearerToken(
  authClient: SupabaseClient,
  authorizationHeader: string | undefined,
): Promise<AuthenticatedUser> {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new AuthenticationError();
  }

  const token = authorizationHeader.slice('Bearer '.length).trim();
  if (!token) throw new AuthenticationError();

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) throw new AuthenticationError('Invalid or expired access token.');

  const claimsResult = await authClient.auth.getClaims(token);
  if (claimsResult.error) throw new AuthenticationError('Could not verify authentication assurance level.');
  const aal = claimsResult.data?.claims?.aal;
  if (aal !== 'aal1' && aal !== 'aal2') throw new AuthenticationError('Authentication assurance level is missing or invalid.');

  return toAuthenticatedUser(data.user, aal);
}
