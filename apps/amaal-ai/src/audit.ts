import { createHash } from 'node:crypto';
import type { DatabaseTransaction, PgTransactionManager } from '@amaal/database';
import { authorize, loadAuthorizationContext } from '@amaal/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@amaal/shared';
import { AI_GOVERNANCE_VERSION, AI_TOOL_POLICY_VERSION, policyForTool, type AmaalAIAutonomy, type AmaalAIRisk, type AmaalAIToolName } from './contracts.ts';
import { PostgresApprovalService } from '@amaal/approvals';
import { PostgresRecoveryService } from '@amaal/recovery';

export type AIConversation = {
  id: string;
  title: string | null;
  status: string;
  provider: string | null;
  model: string | null;
  autonomyLevel: AmaalAIAutonomy;
  createdAt: string;
  updatedAt: string;
};

export type AIActionPlan = {
  id: string;
  conversationId: string | null;
  toolName: AmaalAIToolName;
  riskLevel: 'HIGH'|'CRITICAL';
  autonomyLevel: number;
  summary: string;
  arguments: Record<string, unknown>;
  status: string;
  expiresAt?: string;
  approvalId: string | null;
  executedTargetId: string | null;
  createdAt: string;
  updatedAt: string;
};

export function hashArguments(args: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(args)).digest('hex');
}

export async function organizationIdForUser(tx: DatabaseTransaction, userId: string): Promise<string> {
  const rows = await tx.query<{ organization_id:string }>('select organization_id from public.profiles where user_id=$1 and status=\'ACTIVE\' limit 1',[userId]);
  if (rows.length !== 1) throw new AuthorizationError('Active Amaal organization scope is required.');
  return rows[0]!.organization_id;
}

export async function createConversation(
  manager: PgTransactionManager,
  requestId: string,
  userId: string,
  input: { title?: string; provider?: string; model?: string; autonomyLevel?: number },
): Promise<AIConversation> {
  return manager.withTransaction({requestId,actorUserId:userId},async(tx)=>{
    const organizationId = await organizationIdForUser(tx,userId);
    const rows = await tx.query<AIConversation>(
      `insert into public.ai_conversations(organization_id,user_id,title,provider,model,autonomy_level,governance_version,tool_policy_version)
       values($1,$2,$3,$4,$5,$6,$7,$8)
       returning id,title,status,provider,model,autonomy_level as "autonomyLevel",created_at::text as "createdAt",updated_at::text as "updatedAt"`,
      [organizationId,userId,input.title?.trim()||null,input.provider||null,input.model||null,Math.max(0,Math.min(5,Math.trunc(input.autonomyLevel ?? 1))),AI_GOVERNANCE_VERSION,AI_TOOL_POLICY_VERSION],
    );
    if (rows.length !== 1) throw new ValidationError('AI conversation could not be created.');
    return rows[0]!;
  });
}

export async function appendMessage(
  tx: DatabaseTransaction,
  conversationId: string,
  role: 'USER'|'ASSISTANT'|'TOOL'|'SYSTEM',
  content: string | null,
  structuredPayload?: unknown,
): Promise<string> {
  const rows = await tx.query<{id:string}>(
    `insert into public.ai_messages(conversation_id,role,content,structured_payload) values($1,$2,$3,$4::jsonb) returning id`,
    [conversationId,role,content,structuredPayload == null ? null : JSON.stringify(structuredPayload)],
  );
  if (rows.length !== 1) throw new ValidationError('AI message could not be stored.');
  await tx.query(`update public.ai_conversations set updated_at=now() where id=$1`,[conversationId]);
  return rows[0]!.id;
}

export type AIConversationModelMessage = { role: 'user'|'assistant'; content: string };

export async function loadRecentConversationMessages(
  manager: PgTransactionManager,
  requestId: string,
  userId: string,
  conversationId: string,
  limit = 12,
): Promise<AIConversationModelMessage[]> {
  return manager.withTransaction({requestId,actorUserId:userId},async(tx)=>{
    const safeLimit = Math.max(2, Math.min(20, Math.trunc(limit)));
    const rows = await tx.query<{role:string;content:string|null}>(
      `select m.role,m.content
       from public.ai_messages m
       join public.ai_conversations c on c.id=m.conversation_id
       where m.conversation_id=$1 and c.user_id=$2 and m.role in ('USER','ASSISTANT') and m.content is not null
       order by m.created_at desc
       limit ${safeLimit}`,
      [conversationId,userId],
    );
    return rows.reverse().map((row)=>({role:row.role === 'USER' ? 'user' : 'assistant',content:(row.content ?? '').slice(0,4000)}));
  });
}

export async function recordToolInvocation(
  tx: DatabaseTransaction,
  input: {
    conversationId?: string;
    userId: string;
    agent: string;
    model?: string;
    tool: AmaalAIToolName;
    risk: AmaalAIRisk;
    autonomy: AmaalAIAutonomy;
    args: Record<string,unknown>;
    authorizationResult: string;
    resultClassification?: string;
    actionState?: string;
    approvalId?: string;
    durationMs?: number;
    errorCode?: string;
  },
): Promise<void> {
  await tx.query(
    `insert into public.ai_tool_invocations(conversation_id,requesting_user_id,agent,model,tool_name,risk_level,autonomy_level,arguments_hash,authorization_result,result_classification,action_state,approval_id,duration_ms,error_code,governance_version,tool_policy_version)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [input.conversationId ?? null,input.userId,input.agent,input.model ?? null,input.tool,input.risk,input.autonomy,hashArguments(input.args),input.authorizationResult,input.resultClassification ?? null,input.actionState ?? null,input.approvalId ?? null,input.durationMs ?? null,input.errorCode ?? null,AI_GOVERNANCE_VERSION,AI_TOOL_POLICY_VERSION],
  );
}

export async function createActionPlan(
  manager: PgTransactionManager,
  requestId: string,
  userId: string,
  input: { conversationId?: string; toolName:AmaalAIToolName; riskLevel:'HIGH'|'CRITICAL'; autonomyLevel:number; summary:string; arguments:Record<string,unknown> },
): Promise<AIActionPlan> {
  return manager.withTransaction({requestId,actorUserId:userId},async(tx)=>{
    const context = await loadAuthorizationContext(tx,userId);
    const decision = authorize(context,'ai.execute');
    if (!decision.allowed) throw new AuthorizationError(decision.reason);
    const policy = policyForTool(input.toolName);
    if (policy.risk !== input.riskLevel || policy.autonomy !== input.autonomyLevel) throw new ValidationError('AI action plan policy does not match the selected tool.');
    if (policy.risk !== 'HIGH' && policy.risk !== 'CRITICAL') throw new ValidationError('Only high-risk Amaal AI tools can create action plans.');
    const organizationId = await organizationIdForUser(tx,userId);
    const rows = await tx.query<AIActionPlan>(
      `insert into public.ai_action_plans(organization_id,conversation_id,created_by,tool_name,risk_level,autonomy_level,summary,arguments,governance_version,tool_policy_version)
       values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
       returning id,conversation_id as "conversationId",tool_name as "toolName",risk_level as "riskLevel",autonomy_level as "autonomyLevel",summary,arguments,status,approval_id as "approvalId",executed_target_id as "executedTargetId",expires_at::text as "expiresAt",created_at::text as "createdAt",updated_at::text as "updatedAt"`,
      [organizationId,input.conversationId ?? null,userId,input.toolName,input.riskLevel,input.autonomyLevel,input.summary.slice(0,500),JSON.stringify(input.arguments),AI_GOVERNANCE_VERSION,AI_TOOL_POLICY_VERSION],
    );
    if (rows.length !== 1) throw new ValidationError('AI action plan could not be created.');
    return rows[0]!;
  });
}

export async function listActionPlans(manager: PgTransactionManager, requestId: string, userId: string): Promise<AIActionPlan[]> {
  return manager.withTransaction({requestId,actorUserId:userId},async(tx)=>{
    const context = await loadAuthorizationContext(tx,userId);
    const allowed = authorize(context,'ai.use');
    if (!allowed.allowed) throw new AuthorizationError(allowed.reason);
    const rows = await tx.query<AIActionPlan>(
      `select p.id,p.conversation_id as "conversationId",p.tool_name as "toolName",p.risk_level as "riskLevel",p.autonomy_level as "autonomyLevel",p.summary,p.arguments,
              case
                when p.status in ('DRAFT','PENDING_APPROVAL') and p.expires_at <= now() then 'EXPIRED'
                when p.status='PENDING_APPROVAL' and ar.status='APPROVED' then 'APPROVED'
                when p.status='PENDING_APPROVAL' and ar.status='REJECTED' then 'REJECTED'
                else p.status
              end as status,
              p.approval_id as "approvalId",p.executed_target_id as "executedTargetId",p.expires_at::text as "expiresAt",p.created_at::text as "createdAt",p.updated_at::text as "updatedAt"
       from public.ai_action_plans p
       left join public.approval_requests ar on ar.id=p.approval_id
       where p.created_by=$1 order by p.updated_at desc limit 50`,[userId],
    );
    return rows;
  });
}

export type AIAwaitingApproval = {
  approvalId: string;
  planId: string;
  requestedBy: string;
  toolName: AmaalAIToolName;
  riskLevel: 'HIGH'|'CRITICAL';
  summary: string;
  reason: string;
  createdAt: string;
};

export async function listAIAwaitingApprovals(manager: PgTransactionManager, requestId: string, userId: string): Promise<AIAwaitingApproval[]> {
  return manager.withTransaction({requestId,actorUserId:userId},async(tx)=>{
    const context = await loadAuthorizationContext(tx,userId);
    const auth = authorize(context,'ai.approve');
    if (!auth.allowed) throw new AuthorizationError(auth.reason);
    return tx.query<AIAwaitingApproval>(
      `select a.id as "approvalId",p.id as "planId",a.requested_by as "requestedBy",p.tool_name as "toolName",p.risk_level as "riskLevel",p.summary,a.reason,a.created_at::text as "createdAt"
       from public.approval_requests a
       join public.ai_action_plans p on p.id=a.target_id
       where a.approval_type='AI_ACTION' and a.target_type='AI_ACTION_PLAN' and a.status='PENDING'
         and p.status='PENDING_APPROVAL' and p.expires_at > now()
         and a.requested_by<>$1
       order by a.created_at asc
       limit 50`,
      [userId],
    );
  });
}

export async function decideAIApproval(
  manager: PgTransactionManager,
  requestId: string,
  userId: string,
  approvalId: string,
  decision: 'APPROVED'|'REJECTED',
  reason: string,
): Promise<{approvalId:string;planId:string;status:'APPROVED'|'REJECTED'}> {
  return manager.withTransaction({requestId,actorUserId:userId},async(tx)=>{
    if (!reason.trim()) throw new ValidationError('Decision reason is required.');
    const context = await loadAuthorizationContext(tx,userId);
    const aiAuth = authorize(context,'ai.approve');
    if (!aiAuth.allowed) throw new AuthorizationError(aiAuth.reason);
    const rows = await tx.query<{id:string;target_id:string;target_type:string;requested_by:string;status:string}>(
      `select id,target_id,target_type,requested_by,status from public.approval_requests where id=$1 and approval_type='AI_ACTION' for update`,[approvalId],
    );
    if (rows.length !== 1) throw new ValidationError('Amaal AI approval request not found.');
    const approval=rows[0]!;
    if (approval.target_type !== 'AI_ACTION_PLAN') throw new ValidationError('Amaal AI approval target is invalid.');
    if (approval.status !== 'PENDING') throw new ConflictError(`Approval request is ${approval.status}.`);
    if (approval.requested_by === userId) throw new AuthorizationError('Requester and AI approver must be different users.');
    const planRows = await tx.query<{id:string;status:string;expires_at:string}>(`select id,status,expires_at::text as expires_at from public.ai_action_plans where id=$1 for update`,[approval.target_id]);
    if (planRows.length !== 1) throw new ValidationError('AI action plan not found.');
    if (planRows[0]!.status !== 'PENDING_APPROVAL') throw new ConflictError(`AI action plan is ${planRows[0]!.status}; it is not awaiting approval.`);
    if (new Date(planRows[0]!.expires_at).getTime() <= Date.now()) {
      await tx.query(`update public.ai_action_plans set status='EXPIRED',updated_at=now() where id=$1 and status='PENDING_APPROVAL'`,[approval.target_id]);
      throw new ConflictError('AI action plan has expired; approval is blocked.');
    }
    await new PostgresApprovalService().decide(tx,userId,approvalId,decision,reason.trim());
    await tx.query(`update public.ai_action_plans set status=$1,updated_at=now() where id=$2 and status='PENDING_APPROVAL'`,[decision,approval.target_id]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,approval_request_id,request_id) values($1,'AI_APPROVAL_DECIDED','AI_ACTION_PLAN',$2,$3::jsonb,$4,$5,current_setting('amaal.request_id',true))`,[userId,approval.target_id,JSON.stringify({status:decision}),reason.trim(),approvalId]);
    return {approvalId,planId:approval.target_id,status:decision};
  });
}

export async function recordGovernanceEvent(
  tx: DatabaseTransaction,
  input: { userId: string; conversationId?: string; action: string; details: Record<string, unknown> },
): Promise<void> {
  await tx.query(
    `insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id)
     values($1,$2,'AI_CONVERSATION',$3,$4::jsonb,$5,current_setting('amaal.request_id',true))`,
    [input.userId,input.action,input.conversationId ?? null,JSON.stringify({governance_version:AI_GOVERNANCE_VERSION,tool_policy_version:AI_TOOL_POLICY_VERSION,...input.details}),`Amaal AI governance event`],
  );
}

export async function submitActionPlanForApproval(manager: PgTransactionManager, requestId: string, userId: string, planId: string, reason: string): Promise<{planId:string;approvalId:string}> {
  return manager.withTransaction({requestId,actorUserId:userId},async(tx)=>{
    if (!reason.trim()) throw new ValidationError('Approval reason is required.');
    const context = await loadAuthorizationContext(tx,userId);
    const auth = authorize(context,'approvals.view');
    if (!auth.allowed) throw new AuthorizationError(auth.reason);
    const rows = await tx.query<{id:string;created_by:string;tool_name:string;status:string;summary:string;arguments:Record<string,unknown>}>(
      `select id,created_by,tool_name,status,summary,arguments from public.ai_action_plans where id=$1 for update`,[planId],
    );
    if (rows.length !== 1) throw new ValidationError('AI action plan not found.');
    const plan = rows[0]!;
    if (plan.created_by !== userId && !context.roles.includes('CEO') && !context.roles.includes('ADMIN')) throw new AuthorizationError('AI action plan is outside your scope.');
    if (plan.status !== 'DRAFT') throw new ConflictError(`AI action plan is ${plan.status}.`);
    const expiryRows = await tx.query<{expires_at:string}>(`select expires_at::text as expires_at from public.ai_action_plans where id=$1 for update`,[plan.id]);
    if (expiryRows[0] && new Date(expiryRows[0].expires_at).getTime() <= Date.now()) {
      await tx.query(`update public.ai_action_plans set status='EXPIRED',updated_at=now() where id=$1 and status='DRAFT'`,[plan.id]);
      throw new ConflictError('AI action plan has expired and cannot be submitted.');
    }
    const approvalService = new PostgresApprovalService();
    const approvalId = await approvalService.createRequest(tx,userId,{approvalType:'AI_ACTION',targetType:'AI_ACTION_PLAN',targetId:plan.id,requestedChanges:{toolName:plan.tool_name,summary:plan.summary,arguments:plan.arguments},reason:reason.trim()});
    await tx.query(`update public.ai_action_plans set status='PENDING_APPROVAL',approval_id=$1,updated_at=now() where id=$2`,[approvalId,plan.id]);
    return {planId:plan.id,approvalId};
  });
}

export async function executeApprovedRecoveryPlan(manager: PgTransactionManager, requestId: string, userId: string, planId: string): Promise<{planId:string;targetId:string;status:'EXECUTED'}> {
  return manager.withTransaction({requestId,actorUserId:userId},async(tx)=>{
    const rows = await tx.query<{id:string;created_by:string;tool_name:string;status:string;approval_id:string|null;arguments:Record<string,unknown>}>(
      `select id,created_by,tool_name,status,approval_id,arguments,expires_at::text as expires_at from public.ai_action_plans where id=$1 for update`,[planId],
    );
    if (rows.length !== 1) throw new ValidationError('AI action plan not found.');
    const plan=rows[0]!;
    if (plan.tool_name !== 'create_recovery_case') throw new ValidationError('Only approved recovery-case plans are executable in Stage 8.');
    const context = await loadAuthorizationContext(tx,userId);
    if (plan.created_by !== userId && !context.roles.includes('CEO') && !context.roles.includes('ADMIN')) throw new AuthorizationError('Only the plan creator or a CEO/Admin can execute this AI action plan.');
    if (!['PENDING_APPROVAL','APPROVED'].includes(plan.status) || !plan.approval_id) throw new ConflictError('AI action plan is not approved for execution.');
    if (new Date(plan.expires_at).getTime() <= Date.now()) {
      await tx.query(`update public.ai_action_plans set status='EXPIRED',updated_at=now() where id=$1 and status in ('PENDING_APPROVAL','APPROVED')`,[plan.id]);
      throw new ConflictError('AI action plan has expired and cannot execute.');
    }
    const approval = await tx.query<{status:string}>(`select status from public.approval_requests where id=$1 for update`,[plan.approval_id]);
    if (approval.length !== 1 || approval[0]!.status !== 'APPROVED') throw new ConflictError('AI action plan approval is not APPROVED.');
    const auth = authorize(context,'ai.execute');
    if (!auth.allowed) throw new AuthorizationError(auth.reason);
    const recoveryService = new PostgresRecoveryService();
    const args=plan.arguments;
    const imeiId = typeof args.imeiId === 'string' && args.imeiId.trim() ? args.imeiId.trim() : null;
    const reason = typeof args.reason === 'string' && args.reason.trim() ? args.reason.trim() : null;
    const priority = Number(args.priority ?? 0);
    if (!imeiId || !reason || !Number.isFinite(priority) || priority < 0) throw new ValidationError('Approved AI recovery plan contains invalid recovery arguments.');
    const targetId=await recoveryService.createCase(tx,userId,{
      imeiId,
      ...(typeof args.customerId==='string' && args.customerId.trim() ? {customerId:args.customerId.trim()}:{}),
      reason,
      priority: Math.trunc(priority),
      ...(typeof args.dueAt==='string' && args.dueAt.trim() ? {dueAt:args.dueAt.trim()}:{}),
      ...(typeof args.notes==='string' && args.notes.trim() ? {notes:args.notes.trim()}:{}),
    });
    await tx.query(`update public.ai_action_plans set status='EXECUTED',executed_target_id=$1,updated_at=now() where id=$2`,[targetId,plan.id]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,approval_request_id,request_id) values($1,'AI_ACTION_EXECUTED','AI_ACTION_PLAN',$2,$3::jsonb,'Approved Amaal AI recovery action',$4,current_setting('amaal.request_id',true))`,[userId,plan.id,JSON.stringify({tool_name:plan.tool_name,executed_target_id:targetId}),plan.approval_id]);
    return {planId:plan.id,targetId,status:'EXECUTED' as const};
  });
}
