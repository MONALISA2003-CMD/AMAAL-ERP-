import { randomUUID } from 'node:crypto';
import { createPool, PgTransactionManager } from '@amaal/database';
import { PostgresOutboxWorker, PostgresRealtimePublisher, reconcileInventoryReadModel } from './index.js';

const workerId = process.env.RENDER_INSTANCE_ID ?? process.env.HOSTNAME ?? randomUUID();
const pool = createPool();
const transactions = new PgTransactionManager(pool);
const publisher = new PostgresRealtimePublisher(transactions);
const worker = new PostgresOutboxWorker(workerId, transactions, publisher);

let stopping = false;
let lastReconcile = 0;

async function tick() {
  if (stopping) return;
  await worker.runOnce(50);
  const now = Date.now();
  if (now - lastReconcile >= 15_000) {
    await reconcileInventoryReadModel(transactions);
    lastReconcile = now;
  }
}

async function main() {
  console.log(`[amaal-worker] starting ${workerId}`);
  while (!stopping) {
    try {
      await tick();
    } catch (error) {
      console.error('[amaal-worker] tick failed', error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await pool.end();
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

void main();
