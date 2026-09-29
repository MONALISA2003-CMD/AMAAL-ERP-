import { Kysely, PostgresDialect } from 'kysely';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import type { DatabaseTransaction, TransactionContext, TransactionManager } from './index.ts';

export type AmaalDatabase = Record<string, unknown>;

export class PgDatabaseTransaction implements DatabaseTransaction {
  constructor(
    private readonly client: PoolClient,
    private readonly context: TransactionContext,
  ) {}

  async query<T = unknown>(sqlText: string, params: readonly unknown[] = []): Promise<T[]> {
    const result = await this.client.query<QueryResultRow>(sqlText, [...params]);
    return result.rows as T[];
  }

  async commit(): Promise<void> {
    await this.client.query('commit');
  }

  async rollback(): Promise<void> {
    await this.client.query('rollback');
  }

  async setLocalUser(): Promise<void> {
    await this.client.query(`select set_config('amaal.actor_user_id', $1, true)`, [this.context.actorUserId]);
    await this.client.query(`select set_config('amaal.request_id', $1, true)`, [this.context.requestId]);
  }
}

export function createKysely(pool: Pool): Kysely<AmaalDatabase> {
  return new Kysely<AmaalDatabase>({
    dialect: new PostgresDialect({ pool }),
  });
}

export function createPool(connectionString = process.env.AMAAL_DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error('AMAAL_DATABASE_URL is required for the PostgreSQL backend.');
  }

  return new Pool({
    connectionString,
    max: Number(process.env.AMAAL_DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'amaal-erp-api',
  });
}

export class PgTransactionManager implements TransactionManager {
  constructor(private readonly pool: Pool) {}

  async withTransaction<T>(context: TransactionContext, operation: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const tx = new PgDatabaseTransaction(client, context);

    try {
      await client.query('begin');
      await tx.setLocalUser();
      const result = await operation(tx);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      client.release();
    }
  }
}

export type DatabaseHealthcheckFailure = {
  ok: false;
  errorCode: string;
  errorName: string;
  errorClass: string;
};

export type DatabaseHealthcheckResult =
  | { ok: true }
  | DatabaseHealthcheckFailure;

function databaseErrorDetails(error: unknown): DatabaseHealthcheckFailure {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const errorCode = typeof record.code === 'string' && record.code.trim() ? record.code : 'UNKNOWN';
  const errorName = error instanceof Error && error.name ? error.name : 'Error';

  let errorClass = 'unknown';
  if (['28P01', '28000'].includes(errorCode)) errorClass = 'authentication';
  else if (['ENOTFOUND', 'EAI_AGAIN'].includes(errorCode)) errorClass = 'dns';
  else if (['ECONNREFUSED'].includes(errorCode)) errorClass = 'connection_refused';
  else if (['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(errorCode)) errorClass = 'timeout';
  else if (['ENETUNREACH', 'EHOSTUNREACH'].includes(errorCode)) errorClass = 'network_unreachable';
  else if (['08001', '08003', '08004', '08006', '08007', '08020', '08030'].includes(errorCode)) errorClass = 'postgres_connection';

  return { ok: false, errorCode, errorName, errorClass };
}

export async function healthcheck(pool: Pool): Promise<DatabaseHealthcheckResult> {
  try {
    const result = await pool.query<{ ok: number }>('select 1 as ok');
    if (result.rows[0]?.ok === 1) return { ok: true };
    return {
      ok: false,
      errorCode: 'INVALID_HEALTHCHECK_RESULT',
      errorName: 'HealthcheckResultError',
      errorClass: 'database_response',
    };
  } catch (error) {
    return databaseErrorDetails(error);
  }
}
