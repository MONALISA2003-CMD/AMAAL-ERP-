export interface DbTransaction {
  query<T>(sql: string, params?: readonly unknown[]): Promise<readonly T[]>;
  execute(sql: string, params?: readonly unknown[]): Promise<void>;
}

export interface TransactionRunner {
  run<T>(work: (tx: DbTransaction) => Promise<T>): Promise<T>;
}

export async function runTransactional<T>(
  runner: TransactionRunner,
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return runner.run(work);
}
