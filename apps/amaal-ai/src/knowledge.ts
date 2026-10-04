import type { DatabaseTransaction } from '@amaal/database';
import { authorize, loadAuthorizationContext } from '@amaal/permissions';
import { AuthorizationError, ValidationError } from '@amaal/shared';

export type KnowledgeResult = {
  id: string;
  documentKey: string;
  title: string;
  sourceType: string;
  classification: string;
  excerpt: string;
  score: number;
};

function limit(value: unknown): number {
  const n = Number(value ?? 5);
  if (!Number.isFinite(n)) throw new ValidationError('limit must be a number.');
  return Math.min(Math.max(Math.trunc(n),1),20);
}

export async function searchAmaalKnowledge(
  tx: DatabaseTransaction,
  actorUserId: string,
  query: string,
  requestedLimit: unknown,
): Promise<KnowledgeResult[]> {
  const cleaned = query.trim();
  if (!cleaned) throw new ValidationError('query is required.');
  const context = await loadAuthorizationContext(tx,actorUserId);
  const decision = authorize(context,'ai.knowledge.view');
  if (!decision.allowed) throw new AuthorizationError(decision.reason);

  const profileRows = await tx.query<{ organization_id:string }>('select organization_id from public.profiles where user_id=$1 and status=\'ACTIVE\' limit 1',[actorUserId]);
  if (profileRows.length !== 1) throw new AuthorizationError('Amaal AI organization scope is unavailable.');
  const organizationId = profileRows[0]!.organization_id;
  const max = limit(requestedLimit);

  const rows = await tx.query<KnowledgeResult>(
    `select id,document_key as "documentKey",title,source_type as "sourceType",classification,
            left(content,4000) as excerpt,
            ts_rank(to_tsvector('simple',title || ' ' || content),plainto_tsquery('simple',$1))::float8 as score
     from public.ai_knowledge_documents
     where organization_id=$2
       and status='ACTIVE'
       and (
         cardinality(required_permissions)=0
         or required_permissions <@ $3::text[]
       )
       and (
         cardinality(allowed_roles)=0
         or allowed_roles && $4::text[]
       )
       and (
         cardinality(allowed_region_ids)=0
         or allowed_region_ids && $5::uuid[]
       )
       and (
         cardinality(allowed_team_ids)=0
         or allowed_team_ids && $6::uuid[]
       )
       and to_tsvector('simple',title || ' ' || content) @@ plainto_tsquery('simple',$1)
     order by score desc,updated_at desc
     limit $7`,
    [cleaned,organizationId,[...context.permissions], [...context.roles], [...context.regionIds], [...context.teamIds], max],
  );
  return rows;
}
