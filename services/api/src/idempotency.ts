import { createHash } from 'node:crypto';
import type { DatabaseTransaction } from '@amaal/database';
import { ConflictError } from '@amaal/shared';
import type { ApiServices } from './index.js';

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(',')}}`;
}

function requestHash(payload: unknown): string {
  return createHash('sha256').update(canonicalize(payload)).digest('hex');
}

export async function withIdempotency<T>(
  services: ApiServices,
  requestId: string,
  actorUserId: string,
  operation: string,
  idempotencyKey: string | undefined,
  requestFingerprint: unknown,
  work: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return services.transactions.withTransaction({requestId, actorUserId}, async (tx) => {
    if (!idempotencyKey) return work(tx);
    if (idempotencyKey.length > 128) throw new ConflictError('Idempotency key must be 128 characters or fewer.');

    const hash = requestHash(requestFingerprint);
    const inserted = await tx.query<{ id:string }>(
      `insert into public.idempotency_keys(actor_user_id,operation,idempotency_key,request_hash)
       values ($1,$2,$3,$4)
       on conflict (actor_user_id,operation,idempotency_key) do nothing
       returning id`,
      [actorUserId,operation,idempotencyKey,hash],
    );

    if (!inserted.length) {
      const existingRows = await tx.query<{ request_hash:string; status:string; response:Record<string,unknown>|null }>(
        `select request_hash,status,response
         from public.idempotency_keys
         where actor_user_id=$1 and operation=$2 and idempotency_key=$3
         for update`,
        [actorUserId,operation,idempotencyKey],
      );
      const existing = existingRows[0];
      if (!existing) throw new ConflictError('Idempotency record could not be recovered.');
      if (existing.request_hash !== hash) throw new ConflictError('Idempotency key was already used for a different request.');
      if (existing.status === 'COMPLETED') return existing.response as T;
      throw new ConflictError('A request with this idempotency key is still being processed.');
    }

    const result = await work(tx);
    const response = result === undefined ? null : result;
    await tx.query(
      `update public.idempotency_keys
       set status='COMPLETED',response=$1::jsonb,completed_at=now()
       where actor_user_id=$2 and operation=$3 and idempotency_key=$4`,
      [JSON.stringify(response),actorUserId,operation,idempotencyKey],
    );
    return result;
  });
}
