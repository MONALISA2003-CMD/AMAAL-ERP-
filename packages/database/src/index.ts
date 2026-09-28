export type TransactionContext = {
  requestId: string;
  actorUserId: string;
};

export interface DatabaseTransaction {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface TransactionManager {
  withTransaction<T>(
    context: TransactionContext,
    operation: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T>;
}

export * from './postgres.js';
