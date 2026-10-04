import { authorize, loadAuthorizationContext, type AuthorizationContext } from '@amaal/permissions';
import { AuthorizationError, ValidationError } from '@amaal/shared';
import type { ApiServices } from './index.ts';

export type IntelligenceKind =
  | 'DEMAND_FORECAST'
  | 'AGING_RISK'
  | 'RECOVERY_PRIORITY'
  | 'ANOMALY'
  | 'STOCK_OPTIMIZATION'
  | 'PRODUCT_VELOCITY'
  | 'REGIONAL_FORECAST';

function requireIntelligenceView(context: AuthorizationContext): void {
  const decision = authorize(context, 'ai.intelligence.view');
  if (!decision.allowed) throw new AuthorizationError(decision.reason);
}

function safeLimit(value: number): number { return Math.max(1, Math.min(100, Math.trunc(value || 20))); }

async function tableExists(services: ApiServices, table: string): Promise<boolean> {
  const result = await services.pool.query({
    text: `select exists(select 1 from information_schema.tables where table_schema='public' and table_name=$1) as exists`,
    values: [table],
  });
  return Boolean(result.rows[0]?.exists);
}

function scopedPredictionSql(context: AuthorizationContext, actorUserId: string): { text: string; values: unknown[] } {
  if (context.roles.includes('CEO') || (context.roles.includes('ADMIN') && context.permissions.includes('ai.intelligence.manage'))) return { text: '', values: [] };
  const values: unknown[] = [actorUserId];
  const clauses = [`(p.seller_user_id=$1)`];
  if (context.regionIds.length) { values.push(context.regionIds); clauses.push(`p.region_id = any($${values.length}::uuid[])`); }
  if (context.teamIds.length) { values.push(context.teamIds); clauses.push(`p.team_id = any($${values.length}::uuid[])`); }
  return { text: `and (${clauses.join(' or ')})`, values };
}

export async function getIntelligenceStatus(services: ApiServices, requestId: string, actorUserId: string) {
  return services.transactions.withTransaction({ requestId, actorUserId }, async (tx) => {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requireIntelligenceView(context);
    const predictionsInstalled = await tableExists(services, 'ml_predictions');
    const registryInstalled = await tableExists(services, 'ml_model_registry');
    const rows = predictionsInstalled ? await tx.query<{total:string; shadow:string; predicted:string; latest:string|null}>(
      `select count(*)::bigint::text as total,
              count(*) filter(where status='SHADOW')::bigint::text as shadow,
              count(*) filter(where status='PREDICTED')::bigint::text as predicted,
              max(updated_at)::text as latest
         from public.ml_predictions
        where organization_id=(select organization_id from public.profiles where user_id=$1 limit 1)`,
      [actorUserId],
    ) : [{ total:'0', shadow:'0', predicted:'0', latest:null }];
    return {
      requestId,
      featureSchemaVersion: '9.1',
      governanceVersion: '9.1',
      mode: predictionsInstalled ? 'SHADOW_READY' : 'FOUNDATION_ONLY',
      modelRegistryInstalled: registryInstalled,
      predictionsInstalled,
      totals: {
        predictions: Number(rows[0]?.total ?? 0),
        shadow: Number(rows[0]?.shadow ?? 0),
        predicted: Number(rows[0]?.predicted ?? 0),
      },
      latestPredictionAt: rows[0]?.latest ?? null,
      activation: 'No model is activated automatically; Stage 10 remains the production gate.',
    };
  });
}

export async function listIntelligencePredictions(
  services: ApiServices,
  requestId: string,
  actorUserId: string,
  options: { kind?: IntelligenceKind; limit?: number } = {},
) {
  const kind = options.kind;
  if (kind && !['DEMAND_FORECAST','AGING_RISK','RECOVERY_PRIORITY','ANOMALY','STOCK_OPTIMIZATION','PRODUCT_VELOCITY','REGIONAL_FORECAST'].includes(kind)) throw new ValidationError('Unsupported intelligence prediction kind.');
  return services.transactions.withTransaction({ requestId, actorUserId }, async (tx) => {
    const context = await loadAuthorizationContext(tx, actorUserId);
    requireIntelligenceView(context);
    if (!(await tableExists(services, 'ml_predictions'))) return { mode:'FOUNDATION_ONLY', items:[] };
    const scope = scopedPredictionSql(context, actorUserId);
    const values: unknown[] = [actorUserId];
    const clauses = [
      `p.organization_id=(select organization_id from public.profiles where user_id=$1 limit 1)`,
    ];
    if (!(context.roles.includes('CEO') || (context.roles.includes('ADMIN') && context.permissions.includes('ai.intelligence.manage')))) {
      const scoped = scopedPredictionSql(context, actorUserId);
      values.push(...scoped.values.slice(1));
      clauses.push(scoped.text.replace('and ',''));
    }
    if (kind) { values.push(kind); clauses.push(`p.prediction_kind=$${values.length}`); }
    values.push(safeLimit(options.limit ?? 20));
    const limitParam = values.length;
    const rows = await tx.query(
      `select p.id,p.model_key,p.model_version,p.prediction_kind,p.entity_type,p.entity_id,
              p.region_id,p.team_id,p.seller_user_id,p.product_variant_id,p.as_of_date,
              p.status,p.value,p.confidence,p.explanation,p.feature_schema_version,p.governance_version,p.updated_at
         from public.ml_predictions p
        where ${clauses.join(' and ')}
        order by p.as_of_date desc,p.updated_at desc
        limit $${limitParam}`,
      values,
    );
    return { mode:'SHADOW_READY', items:rows };
  });
}

export async function getIntelligenceSummary(services: ApiServices, requestId: string, actorUserId: string) {
  const status = await getIntelligenceStatus(services, requestId, actorUserId);
  const [risk, forecasts, recovery, anomalies] = await Promise.all([
    listIntelligencePredictions(services,requestId,actorUserId,{kind:'AGING_RISK',limit:10}),
    listIntelligencePredictions(services,requestId,actorUserId,{kind:'DEMAND_FORECAST',limit:10}),
    listIntelligencePredictions(services,requestId,actorUserId,{kind:'RECOVERY_PRIORITY',limit:10}),
    listIntelligencePredictions(services,requestId,actorUserId,{kind:'ANOMALY',limit:10}),
  ]);
  return { ...status, sections:{ agingRisk:risk.items, demand:forecasts.items, recoveryPriority:recovery.items, anomalies:anomalies.items } };
}
