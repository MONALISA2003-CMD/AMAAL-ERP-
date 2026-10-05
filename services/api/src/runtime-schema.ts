import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

let migrationText: string | null = null;

async function loadStage5Migration(): Promise<string> {
  if (migrationText) return migrationText;
  migrationText = await readFile(
    new URL('../../../database/migrations/20261004_000029_phase5_aging_recovery_suspension_engine.sql', import.meta.url),
    'utf8',
  );
  return migrationText;
}

// The migration is version-controlled and idempotent. This runtime guard is a
// narrow emergency bridge for a live environment whose schema was observed to
// be behind the application code. It reconciles the complete Phase 5 surface
// before authenticated access is evaluated.
export async function ensureRuntimeSchema(pool: Pool): Promise<void> {
  const current = await pool.query<{ ready: boolean }>(`
    select (
      to_regclass('public.aging_asset_states') is not null and
      to_regclass('public.aging_state_events') is not null and
      to_regclass('public.aging_alerts') is not null and
      to_regclass('public.recovery_case_assignments') is not null and
      to_regclass('public.recovery_escalations') is not null and
      to_regclass('public.business_access_suspensions') is not null
    ) as ready
  `);
  if (current[0]?.ready) return;

  const sql = await loadStage5Migration();
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(hashtext('amaal:phase5-runtime-repair'))`);
    await client.query(sql);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    console.error(JSON.stringify({ event: 'runtime_schema_repair_failed', error: error instanceof Error ? error.message : String(error) }));
  } finally {
    client.release();
  }
}
