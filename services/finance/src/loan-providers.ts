import type { DatabaseTransaction } from '@amaal/database';
import { authorize, loadAuthorizationContext } from '@amaal/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@amaal/shared';

function requirePermission(context: Awaited<ReturnType<typeof loadAuthorizationContext>>, permission: string): void {
  const decision = authorize(context, permission);
  if (!decision.allowed) throw new AuthorizationError(decision.reason);
}

async function orgId(tx: DatabaseTransaction, userId: string): Promise<string> {
  const rows = await tx.query<{organization_id:string}>(`select organization_id from public.profiles where user_id=$1 and status='ACTIVE'`,[userId]);
  if (rows.length !== 1) throw new AuthorizationError('Actor is not linked to an active organization.');
  return rows[0]!.organization_id;
}

export class PostgresLoanProviderService {
  async list(tx: DatabaseTransaction, actorUserId: string) {
    const context=await loadAuthorizationContext(tx,actorUserId); requirePermission(context,'finance.view');
    const organizationId=await orgId(tx,actorUserId);
    return tx.query(`select id,provider_code as "providerCode",provider_name as "providerName",contact_reference as "contactReference",status,created_at as "createdAt",updated_at as "updatedAt" from public.loan_providers where organization_id=$1 order by provider_name`,[organizationId]);
  }
  async create(tx: DatabaseTransaction, actorUserId: string, input:{providerCode:string;providerName:string;contactReference?:string}) {
    const context=await loadAuthorizationContext(tx,actorUserId); requirePermission(context,'loan_providers.manage');
    if(!input.providerCode.trim()||!input.providerName.trim()) throw new ValidationError('Loan provider code and name are required.');
    const organizationId=await orgId(tx,actorUserId);
    try {
      const rows=await tx.query<{id:string}>(`insert into public.loan_providers(organization_id,provider_code,provider_name,contact_reference,status,created_by,updated_at) values($1,$2,$3,$4,'ACTIVE',$5,now()) returning id`,[organizationId,input.providerCode.trim().toUpperCase(),input.providerName.trim(),input.contactReference?.trim()||null,actorUserId]);
      if(rows.length!==1) throw new ValidationError('Loan provider could not be created.');
      await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id) values($1,'LOAN_PROVIDER_CREATED','LOAN_PROVIDER',$2,$3::jsonb,'Phase 4 loan provider master data',current_setting('amaal.request_id',true))`,[actorUserId,rows[0]!.id,JSON.stringify(input)]);
      await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('LOAN_PROVIDER_CREATED','LOAN_PROVIDER',$1,$2,$3::jsonb)`,[rows[0]!.id,actorUserId,JSON.stringify(input)]);
      return {id:rows[0]!.id};
    } catch(error) {
      if(error instanceof Error && /duplicate key/i.test(error.message)) throw new ConflictError('A loan provider with this code or name already exists.');
      throw error;
    }
  }
  async archive(tx: DatabaseTransaction, actorUserId: string, providerId: string) {
    const context=await loadAuthorizationContext(tx,actorUserId); requirePermission(context,'loan_providers.manage');
    const organizationId=await orgId(tx,actorUserId);
    const rows=await tx.query<{id:string}>(`update public.loan_providers set status='ARCHIVED',updated_at=now() where id=$1 and organization_id=$2 and status='ACTIVE' returning id`,[providerId,organizationId]);
    if(rows.length!==1) throw new ValidationError('Loan provider not found or already archived.');
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id) values($1,'LOAN_PROVIDER_ARCHIVED','LOAN_PROVIDER',$2,$3::jsonb,'Phase 4 loan provider archival',current_setting('amaal.request_id',true))`,[actorUserId,providerId,JSON.stringify({status:'ARCHIVED'})]);
    return {id:providerId,status:'ARCHIVED' as const};
  }
}
