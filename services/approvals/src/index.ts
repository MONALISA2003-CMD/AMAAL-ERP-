import type { DatabaseTransaction } from '@amaal/database';
import { authorize, loadAuthorizationContext } from '@amaal/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@amaal/shared';

export type ApprovalType = 'DISCOUNT'|'PRICE_CHANGE'|'INVENTORY_ADJUSTMENT'|'WRITE_OFF'|'COMMISSION_OVERRIDE'|'BONUS_OVERRIDE'|'IMEI_EXCEPTION'|'FINANCIAL_CORRECTION'|'ROLE_CHANGE'|'WAREHOUSE_CORRECTION';

export class PostgresApprovalService {
  async createRequest(tx: DatabaseTransaction, actorUserId: string, input: { approvalType: ApprovalType; targetType: string; targetId: string; requestedChanges: Record<string, unknown>; reason: string }): Promise<string> {
    if (!input.reason.trim()) throw new ValidationError('Approval reason is required.');
    const context = await loadAuthorizationContext(tx, actorUserId);
    const decision = authorize(context, 'approvals.view');
    if (!decision.allowed) throw new AuthorizationError(decision.reason);
    const rows = await tx.query<{ id: string }>(
      `insert into public.approval_requests(approval_type,requested_by,target_type,target_id,requested_changes,reason)
       values ($1,$2,$3,$4,$5::jsonb,$6) returning id`,
      [input.approvalType,actorUserId,input.targetType,input.targetId,JSON.stringify(input.requestedChanges),input.reason],
    );
    if (rows.length !== 1) throw new ValidationError('Approval request could not be created.');
    const id = rows[0]!.id;
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id)
      values ($1,'APPROVAL_CREATED','APPROVAL_REQUEST',$2,$3::jsonb,$4,current_setting('amaal.request_id', true))`, [actorUserId,id,JSON.stringify({ approval_type: input.approvalType, target_type: input.targetType, target_id: input.targetId }),input.reason]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload)
      values ('APPROVAL_CREATED','APPROVAL_REQUEST',$1,$2,$3::jsonb)`, [id,actorUserId,JSON.stringify({ approval_request_id:id, approval_type:input.approvalType })]);
    return id;
  }

  async decide(tx: DatabaseTransaction, actorUserId: string, approvalId: string, decision: 'APPROVED'|'REJECTED', reason: string): Promise<void> {
    const context = await loadAuthorizationContext(tx, actorUserId);
    const auth = authorize(context, decision === 'APPROVED' ? 'approvals.approve' : 'approvals.reject');
    if (!auth.allowed) throw new AuthorizationError(auth.reason);
    const rows = await tx.query<{ requested_by:string; status:string }>('select requested_by,status from public.approval_requests where id=$1 for update',[approvalId]);
    if (rows.length !== 1) throw new ValidationError('Approval request not found.');
    const approval = rows[0]!;
    if (approval.status !== 'PENDING') throw new ConflictError(`Approval request is ${approval.status}.`);
    if (approval.requested_by === actorUserId) throw new AuthorizationError('Requester and approver must be different users.');
    if (!reason.trim()) throw new ValidationError('Decision reason is required.');
    await tx.query(`insert into public.approval_decisions(approval_request_id,decided_by,decision,reason)
      values ($1,$2,$3,$4)`, [approvalId,actorUserId,decision,reason]);
    await tx.query(`update public.approval_requests set status=$1,resolved_at=now() where id=$2`, [decision,approvalId]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,approval_request_id,request_id)
      values ($1,'APPROVAL_COMPLETED','APPROVAL_REQUEST',$2,$3::jsonb,$4,$2,current_setting('amaal.request_id', true))`, [actorUserId,approvalId,JSON.stringify({ status: decision }),reason]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload)
      values ('APPROVAL_COMPLETED','APPROVAL_REQUEST',$1,$2,$3::jsonb)`, [approvalId,actorUserId,JSON.stringify({ approval_request_id:approvalId, decision })]);
  }
}
