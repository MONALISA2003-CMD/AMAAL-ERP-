import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  sessionId: string | null;
  expiresAt: number;
};

export class AuthenticationError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

function authBaseUrl(): string {
  const value = process.env.AMAAL_NEON_AUTH_URL?.trim();
  if (!value) throw new Error('AMAAL_NEON_AUTH_URL is required for server authentication.');
  return value.replace(/\/$/, '');
}

function jwksUrl(): URL {
  const explicit = process.env.AMAAL_NEON_AUTH_JWKS_URL?.trim();
  return new URL(explicit || `${authBaseUrl()}/.well-known/jwks.json`);
}

let remoteKeys: ReturnType<typeof createRemoteJWKSet> | null = null;

function getRemoteKeys() {
  if (!remoteKeys) remoteKeys = createRemoteJWKSet(jwksUrl());
  return remoteKeys;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function claimSessionId(claims: JWTPayload): string | null {
  return asOptionalString(claims.sid) ?? asOptionalString(claims.sessionId) ?? null;
}

export async function authenticateBearerToken(
  authorizationHeader: string | undefined,
): Promise<AuthenticatedUser> {
  if (!authorizationHeader?.startsWith('Bearer ')) throw new AuthenticationError();
  const token = authorizationHeader.slice('Bearer '.length).trim();
  if (!token) throw new AuthenticationError();

  const expectedIssuer = process.env.AMAAL_NEON_AUTH_ISSUER?.trim();
  let claims: JWTPayload;
  try {
    const verified = await jwtVerify(token, getRemoteKeys(), {
      ...(expectedIssuer ? { issuer: expectedIssuer } : {}),
    });
    claims = verified.payload;
  } catch {
    throw new AuthenticationError('Invalid or expired access token.');
  }

  const id = typeof claims.sub === 'string' ? claims.sub : '';
  if (!id) throw new AuthenticationError('Authenticated user identifier is missing.');

  const expiresAt = typeof claims.exp === 'number' ? claims.exp : 0;
  if (!expiresAt || expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new AuthenticationError('Invalid or expired access token.');
  }

  return {
    id,
    email: asOptionalString(claims.email),
    sessionId: claimSessionId(claims),
    expiresAt,
  };
}
