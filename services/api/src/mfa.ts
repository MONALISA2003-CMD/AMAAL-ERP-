import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

export class MfaError extends Error {
  status: number;
  code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'MfaError';
    this.code = code;
    this.status = status;
  }
}

function requiredKey(name: string, minLength: number): Buffer {
  const raw = process.env[name]?.trim();
  if (!raw || raw.length < minLength) throw new Error(`${name} is not configured.`);
  try {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length >= 32) return decoded.subarray(0, 32);
  } catch {
    // Fall through to UTF-8 hashing.
  }
  return createHash('sha256').update(raw).digest();
}

function encryptionKey(): Buffer {
  return requiredKey('AMAAL_MFA_ENCRYPTION_KEY', 32);
}

function assertionKey(): Buffer {
  return requiredKey('AMAAL_MFA_ASSERTION_KEY', 32);
}

function b64(value: Buffer): string {
  return value.toString('base64url');
}

function fromB64(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function base32Encode(input: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let buffer = 0;
  let output = '';
  for (const byte of input) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31];
  return output;
}

function base32Decode(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = value.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new MfaError('INVALID_MFA_SECRET', 'The MFA secret is invalid.', 500);
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function encryptSecret(secret: string): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { ciphertext: b64(ciphertext), iv: b64(iv), tag: b64(cipher.getAuthTag()) };
}

function decryptSecret(ciphertext: string, iv: string, tag: string): string {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), fromB64(iv));
  decipher.setAuthTag(fromB64(tag));
  return Buffer.concat([decipher.update(fromB64(ciphertext)), decipher.final()]).toString('utf8');
}

function totp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(message).digest();
  const offset = digest[digest.length - 1]! & 15;
  const binary = ((digest[offset]! & 127) << 24) |
    ((digest[offset + 1]! & 255) << 16) |
    ((digest[offset + 2]! & 255) << 8) |
    (digest[offset + 3]! & 255);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

function verifyTotp(secret: string, code: string, nowSeconds = Math.floor(Date.now() / 1000)): number | null {
  const cleaned = code.trim();
  if (!/^\d{6}$/.test(cleaned)) return null;
  const current = Math.floor(nowSeconds / TOTP_PERIOD_SECONDS);
  for (const offset of [0, -1, 1]) {
    const counter = current + offset;
    if (counter < 0) continue;
    const expected = totp(secret, counter);
    const a = Buffer.from(expected);
    const b = Buffer.from(cleaned);
    if (a.length === b.length && timingSafeEqual(a, b)) return counter;
  }
  return null;
}

function createAssertion(userId: string, sessionId: string | null): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = { kind: 'AMAAL_MFA', sub: userId, sid: sessionId, iat: now, exp: now + 15 * 60 };
  const body = b64(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signature = b64(createHmac('sha256', assertionKey()).update(body).digest());
  return `${body}.${signature}`;
}

export function verifyMfaAssertion(value: string | undefined, userId: string, sessionId: string | null): boolean {
  if (!value) return false;
  const [body, signature] = value.split('.');
  if (!body || !signature) return false;
  let provided: Buffer;
  try {
    provided = fromB64(signature);
  } catch {
    return false;
  }
  const expected = b64(createHmac('sha256', assertionKey()).update(body).digest());
  const expectedBuffer = Buffer.from(expected);
  if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) return false;
  try {
    const payload = JSON.parse(fromB64(body).toString('utf8')) as { kind?: string; sub?: string; sid?: string | null; exp?: number };
    if (payload.kind !== 'AMAAL_MFA' || payload.sub !== userId || typeof payload.exp !== 'number') return false;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return false;
    if ((payload.sid ?? null) !== (sessionId ?? null)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function getMfaStatus(pool: Pool, userId: string, required: boolean, sessionId: string | null, assertion: string | undefined) {
  const rows = await pool.query<{ status: string }>(
    `select status from public.mfa_factors where user_id = $1 and factor_type = 'TOTP' limit 1`,
    [userId],
  );
  const factorStatus = rows.rows[0]?.status ?? null;
  return {
    required,
    enrolled: factorStatus === 'VERIFIED',
    pending: factorStatus === 'PENDING',
    verified: required ? verifyMfaAssertion(assertion, userId, sessionId) : true,
  };
}

export async function startMfaEnrollment(pool: Pool, userId: string, email: string | null): Promise<{ secret: string; otpauthUri: string }> {
  const current = await pool.query<{ status: string }>(
    `select status from public.mfa_factors where user_id = $1 and factor_type = 'TOTP' limit 1`,
    [userId],
  );
  if (current.rows[0]?.status === 'VERIFIED') {
    throw new MfaError('MFA_ALREADY_ENROLLED', 'Multi-factor authentication is already enrolled.', 409);
  }

  const secret = base32Encode(randomBytes(20));
  const encrypted = encryptSecret(secret);
  await pool.query(
    `insert into public.mfa_factors (user_id, factor_type, status, secret_ciphertext, secret_iv, secret_tag, created_at, updated_at)
     values ($1, 'TOTP', 'PENDING', $2, $3, $4, now(), now())
     on conflict (user_id) do update set factor_type='TOTP', status='PENDING', secret_ciphertext=excluded.secret_ciphertext, secret_iv=excluded.secret_iv, secret_tag=excluded.secret_tag, updated_at=now(), confirmed_at=null, last_verified_at=null, last_used_step=null`,
    [userId, encrypted.ciphertext, encrypted.iv, encrypted.tag],
  );
  const label = encodeURIComponent(`Amaal:${email || userId}`);
  const issuer = encodeURIComponent('Amaal');
  const otpauthUri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
  return { secret, otpauthUri };
}

export async function confirmMfaEnrollment(pool: Pool, userId: string, code: string, sessionId: string | null): Promise<string> {
  const result = await pool.query<{ secret_ciphertext: string; secret_iv: string; secret_tag: string; status: string }>(
    `select secret_ciphertext, secret_iv, secret_tag, status from public.mfa_factors where user_id = $1 and factor_type='TOTP' limit 1`,
    [userId],
  );
  const factor = result.rows[0];
  if (!factor) throw new MfaError('MFA_NOT_STARTED', 'Start MFA setup before confirming it.', 409);
  if (factor.status === 'VERIFIED') throw new MfaError('MFA_ALREADY_ENROLLED', 'Multi-factor authentication is already enrolled.', 409);

  const secret = decryptSecret(factor.secret_ciphertext, factor.secret_iv, factor.secret_tag);
  const step = verifyTotp(secret, code);
  if (step === null) throw new MfaError('INVALID_MFA_CODE', 'That authenticator code is not valid.', 422);
  await pool.query(
    `update public.mfa_factors set status='VERIFIED', confirmed_at=now(), last_verified_at=now(), last_used_step=$2, updated_at=now() where user_id=$1 and status='PENDING'`,
    [userId, step],
  );
  return createAssertion(userId, sessionId);
}

export async function verifyMfaCode(pool: Pool, userId: string, code: string, sessionId: string | null): Promise<string> {
  const result = await pool.query<{ secret_ciphertext: string; secret_iv: string; secret_tag: string; status: string; last_used_step: number | null }>(
    `select secret_ciphertext, secret_iv, secret_tag, status, last_used_step from public.mfa_factors where user_id = $1 and factor_type='TOTP' limit 1`,
    [userId],
  );
  const factor = result.rows[0];
  if (!factor || factor.status !== 'VERIFIED') throw new MfaError('MFA_NOT_ENROLLED', 'Complete MFA setup before verifying a code.', 409);
  const secret = decryptSecret(factor.secret_ciphertext, factor.secret_iv, factor.secret_tag);
  const step = verifyTotp(secret, code);
  if (step === null) throw new MfaError('INVALID_MFA_CODE', 'That authenticator code is not valid.', 422);
  if (factor.last_used_step !== null && step <= Number(factor.last_used_step)) throw new MfaError('MFA_CODE_REPLAY', 'That authenticator code has already been used.', 409);
  const updated = await pool.query(
    `update public.mfa_factors set last_used_step=$2, last_verified_at=now(), updated_at=now() where user_id=$1 and status='VERIFIED' and (last_used_step is null or last_used_step < $2)`,
    [userId, step],
  );
  if (updated.rowCount !== 1) throw new MfaError('MFA_CODE_REPLAY', 'That authenticator code has already been used.', 409);
  return createAssertion(userId, sessionId);
}
