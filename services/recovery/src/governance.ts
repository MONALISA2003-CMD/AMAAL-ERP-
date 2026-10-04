import type { DatabaseTransaction } from '@amaal/database';
import { authorize, loadAuthorizationContext } from '@amaal/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@amaal/shared';

type AgingQueueOptions = {
  status?: 'GREEN'|'ORANGE'|'RED'|'PURPLE';
  regionId?: string;
  teamId?: string;
  holderUserId?: string;
  criticalOnly?: boolean;
  limit?: number;
};

function limitOf(value?: number): number {
  if (value === undefined) return 100;
  if (!Number.isInteger(value) || value < 1 || value > 500) throw new ValidationError('limit must be an integer between 1 and 500.');
  return value;
}

export class PostgresRecoveryGovernanceService {
  async listAgingQueue(tx: DatabaseTransaction, actorUserId: string, options: AgingQueueOptions = {}) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    const auth = authorize(context, 'aging.view');
    if (!auth.allowed) throw new AuthorizationError(auth.reason);
    const params: unknown[] = [];
    const where: string[] = ['1=1'];
    const bind = (value: unknown): string => { params.push(value); return `$${params.length}`; };
    if (options.status) where.push(`s.aging_status=${bind(options.status)}`);
    if (options.regionId) where.push(`i.current_region_id=${bind(options.regionId)}`);
    if (options.teamId) where.push(`i.current_team_id=${bind(options.teamId)}`);
    if (options.holderUserId) where.push(`i.current_holder_user_id=${bind(options.holderUserId)}`);
    if (options.criticalOnly) where.push(`s.is_critical=true`);
    if (!context.roles.includes('CEO') && !context.roles.includes('ADMIN')) where.push('private.user_can_access_imei(s.imei_id)');
    params.push(limitOf(options.limit));
    return tx.query<Record<string, unknown>>(
      `select s.imei_id as "imeiId",i.imei,i.imei_2 as "imei2",s.aging_status as "agingStatus",s.total_field_age_days as "totalFieldAgeDays",s.current_holder_age_days as "currentHolderAgeDays",s.days_remaining as "daysRemaining",s.days_overdue as "daysOverdue",s.is_warning as "isWarning",s.is_overdue as "isOverdue",s.is_critical as "isCritical",
              p.display_name as "holderName",p.user_id as "holderUserId",t.team_name as "teamName",t.id as "teamId",r.region_name as "regionName",r.id as "regionId",sh.shop_name as "shopName",sh.id as "shopId",rc.id as "recoveryCaseId",rc.status as "recoveryStatus"
       from public.aging_asset_states s
       join public.imei_units i on i.id=s.imei_id
       left join public.profiles p on p.user_id=i.current_holder_user_id
       left join public.teams t on t.id=i.current_team_id
       left join public.regions r on r.id=i.current_region_id
       left join public.shops sh on sh.id=i.current_shop_id
       left join lateral(select rc.id,rc.status from public.recovery_cases rc where rc.imei_id=i.id and rc.status not in ('CLOSED','CANCELLED') order by rc.created_at desc limit 1) rc on true
       where ${where.join(' and ')} order by s.is_critical desc,s.is_overdue desc,s.days_overdue desc,s.total_field_age_days desc limit $${params.length}`,
      params,
    );
  }

  async listRecoveryQueue(tx: DatabaseTransaction, actorUserId: string, limit?: number) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    const auth = authorize(context, 'recovery.view');
    if (!auth.allowed) throw new AuthorizationError(auth.reason);
    const take = limitOf(limit);
    const privileged = context.roles.includes('CEO') || context.roles.includes('ADMIN');
    const scope = privileged ? '' : 'and private.user_can_access_imei(rc.imei_id)';
    const params = [take];
    return tx.query<Record<string, unknown>>(
      `select rc.id,rc.case_number as "caseNumber",rc.status,rc.priority,rc.reason,rc.opened_at as "openedAt",rc.due_at as "dueAt",rc.closed_at as "closedAt",rc.assigned_officer_user_id as "assignedOfficerUserId",ao.display_name as "assignedOfficerName",
              i.imei,i.imei_2 as "imei2",i.current_holder_user_id as "holderUserId",hp.display_name as "holderName",i.current_region_id as "regionId",r.region_name as "regionName",i.current_team_id as "teamId",t.team_name as "teamName",i.current_shop_id as "shopId",sh.shop_name as "shopName",
              s.aging_status as "agingStatus",s.total_field_age_days as "totalFieldAgeDays",s.days_overdue as "daysOverdue",s.is_critical as "isCritical"
       from public.recovery_cases rc join public.imei_units i on i.id=rc.imei_id
       left join public.profiles ao on ao.user_id=rc.assigned_officer_user_id left join public.profiles hp on hp.user_id=i.current_holder_user_id
       left join public.regions r on r.id=i.current_region_id left join public.teams t on t.id=i.current_team_id left join public.shops sh on sh.id=i.current_shop_id
       left join public.aging_asset_states s on s.imei_id=i.id
       where rc.status not in ('CLOSED','CANCELLED') ${scope}
       order by rc.priority desc, s.is_critical desc, rc.due_at nulls last, rc.opened_at asc limit $1`,
      params,
    );
  }

  async getRecoveryCase(tx: DatabaseTransaction, actorUserId: string, caseId: string) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    const auth = authorize(context, 'recovery.view');
    if (!auth.allowed) throw new AuthorizationError(auth.reason);
    const rows = await tx.query<Record<string, unknown>>(
      `select rc.id,rc.case_number as "caseNumber",rc.status,rc.priority,rc.reason,rc.opened_at as "openedAt",rc.due_at as "dueAt",rc.closed_at as "closedAt",rc.notes,
              rc.assigned_officer_user_id as "assignedOfficerUserId",ao.display_name as "assignedOfficerName",i.id as "imeiId",i.imei,i.imei_2 as "imei2",i.serial_number as "serialNumber",i.state as "imeiState",i.condition_status as "conditionStatus",i.current_holder_user_id as "holderUserId",hp.display_name as "holderName",i.current_region_id as "regionId",r.region_name as "regionName",i.current_team_id as "teamId",t.team_name as "teamName",i.current_shop_id as "shopId",sh.shop_name as "shopName",
              s.aging_status as "agingStatus",s.total_field_age_days as "totalFieldAgeDays",s.current_holder_age_days as "currentHolderAgeDays",s.days_remaining as "daysRemaining",s.days_overdue as "daysOverdue",s.is_warning as "isWarning",s.is_overdue as "isOverdue",s.is_critical as "isCritical",
              coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'officerUserId',a.officer_user_id,'officerName',ap.display_name,'activityType',a.activity_type,'result',a.result,'verifiedImei',a.verified_imei,'notes',a.notes,'occurredAt',a.occurred_at) order by a.occurred_at desc) from public.recovery_activities a join public.profiles ap on ap.user_id=a.officer_user_id where a.recovery_case_id=rc.id),'[]'::jsonb) as activities,
              coalesce((select jsonb_agg(jsonb_build_object('id',ca.id,'officerUserId',ca.officer_user_id,'officerName',cp.display_name,'assignedAt',ca.assigned_at,'endedAt',ca.ended_at,'reason',ca.assignment_reason) order by ca.assigned_at desc) from public.recovery_case_assignments ca join public.profiles cp on cp.user_id=ca.officer_user_id where ca.recovery_case_id=rc.id),'[]'::jsonb) as assignments,
              coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'toRole',e.to_role,'toUserId',e.to_user_id,'toUserName',ep.display_name,'level',e.escalation_level,'reason',e.reason,'triggeredAt',e.triggered_at,'resolvedAt',e.resolved_at) order by e.triggered_at desc) from public.recovery_escalations e left join public.profiles ep on ep.user_id=e.to_user_id where e.recovery_case_id=rc.id),'[]'::jsonb) as escalations
       from public.recovery_cases rc join public.imei_units i on i.id=rc.imei_id left join public.profiles ao on ao.user_id=rc.assigned_officer_user_id left join public.profiles hp on hp.user_id=i.current_holder_user_id left join public.regions r on r.id=i.current_region_id left join public.teams t on t.id=i.current_team_id left join public.shops sh on sh.id=i.current_shop_id left join public.aging_asset_states s on s.imei_id=i.id
       where rc.id=$1`,[caseId]);
    if (rows.length!==1) throw new ValidationError('Recovery case not found.');
    const row = rows[0]!;
    const decision = authorize(context, 'recovery.view', {
      ownerUserId: typeof row.holderUserId === 'string' ? row.holderUserId : undefined,
      regionId: typeof row.regionId === 'string' ? row.regionId : undefined,
      teamId: typeof row.teamId === 'string' ? row.teamId : undefined,
      shopId: typeof row.shopId === 'string' ? row.shopId : undefined,
    });
    if (!decision.allowed && !context.roles.includes('CEO') && !context.roles.includes('ADMIN')) {
      throw new AuthorizationError(decision.reason);
    }
    return row;
  }

  async listAgingPolicies(tx: DatabaseTransaction, actorUserId: string) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    const auth = authorize(context, 'aging.view');
    if (!auth.allowed) throw new AuthorizationError(auth.reason);
    const organizationIdRows = await tx.query<{organization_id:string}>(`select organization_id from public.profiles where user_id=$1 and status='ACTIVE'`, [actorUserId]);
    if (organizationIdRows.length!==1) throw new AuthorizationError('Actor is not linked to an active organization.');
    return tx.query<Record<string,unknown>>(`
      select id,organization_id as "organizationId",policy_name as "policyName",maximum_days as "maximumDays",warning_days as "warningDays",critical_overdue_days as "criticalOverdueDays",effective_from as "effectiveFrom",effective_to as "effectiveTo",status,band_config as "bandConfig",suspension_config as "suspensionConfig",auto_recovery_enabled as "autoRecoveryEnabled",created_by as "createdBy",approved_by as "approvedBy",created_at as "createdAt"
      from public.aging_policies where organization_id=$1 order by effective_from desc limit 100`, [organizationIdRows[0]!.organization_id]);
  }

  async createAgingPolicy(tx: DatabaseTransaction, actorUserId: string, input: {
    policyName:string; maximumDays:number; warningDays:number; criticalOverdueDays:number; effectiveFrom:string; effectiveTo?:string; bandConfig?:Record<string,unknown>; suspensionConfig?:Record<string,unknown>; autoRecoveryEnabled?:boolean;
  }) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    const auth = authorize(context, 'aging.manage');
    if (!auth.allowed || !context.roles.includes('CEO')) throw new AuthorizationError('Only the CEO may create or activate aging policies.');
    if (!input.policyName.trim()) throw new ValidationError('Aging policy name is required.');
    if (!Number.isInteger(input.maximumDays) || input.maximumDays < 1) throw new ValidationError('maximumDays must be a positive integer.');
    if (!Number.isInteger(input.warningDays) || input.warningDays < 0 || input.warningDays > input.maximumDays) throw new ValidationError('warningDays must be between 0 and maximumDays.');
    if (!Number.isInteger(input.criticalOverdueDays) || input.criticalOverdueDays < 0) throw new ValidationError('criticalOverdueDays must be non-negative.');
    const orgRows = await tx.query<{organization_id:string}>(`select organization_id from public.profiles where user_id=$1 and status='ACTIVE'`, [actorUserId]);
    if (orgRows.length!==1) throw new AuthorizationError('Actor is not linked to an active organization.');
    const bandConfig = input.bandConfig ?? {green:{minDays:1,maxDays:7},orange:{minDays:8,maxDays:13},red:{minDays:14,maxDays:17},purple:{minDays:18,maxDays:null}};
    const suspensionConfig = input.suspensionConfig ?? {agentCriticalDays:18,agentAgedDeviceThreshold:4,teamLeaderAgedAgentThreshold:4,managerAgedTeamThreshold:4,teamAgedDeviceThreshold:4};
    const existing = await tx.query<{id:string;effective_from:string;effective_to:string|null}>(`select id,effective_from,effective_to from public.aging_policies where organization_id=$1 and status='ACTIVE' and effective_from<=now() and (effective_to is null or effective_to>now()) order by effective_from desc limit 1`, [orgRows[0]!.organization_id]);
    const from = new Date(input.effectiveFrom);
    if (Number.isNaN(from.getTime())) throw new ValidationError('effectiveFrom must be a valid timestamp.');
    if (existing.length && from <= new Date()) throw new ConflictError('An active aging policy already exists; a replacement policy must start in the future.');
    const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
    if (effectiveTo && effectiveTo <= from) throw new ValidationError('effectiveTo must be after effectiveFrom.');
    if (effectiveTo && existing.length && effectiveTo <= new Date(existing[0]!.effective_from)) throw new ValidationError('New policy window does not follow the current active policy.');
    if (existing.length) {
      await tx.query(`update public.aging_policies set effective_to=$1 where id=$2`, [from.toISOString(), existing[0]!.id]);
    }
    const rows = await tx.query<{id:string}>(`insert into public.aging_policies(organization_id,policy_name,maximum_days,warning_days,critical_overdue_days,effective_from,effective_to,status,created_by,approved_by,band_config,suspension_config,auto_recovery_enabled) values($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,$8,$9::jsonb,$10::jsonb,$11) returning id`, [orgRows[0]!.organization_id,input.policyName.trim(),input.maximumDays,input.warningDays,input.criticalOverdueDays,input.effectiveFrom,effectiveTo?.toISOString() ?? null,actorUserId,JSON.stringify(bandConfig),JSON.stringify(suspensionConfig),input.autoRecoveryEnabled ?? true]);
    if (rows.length!==1) throw new ValidationError('Aging policy could not be created.');
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,reason,new_state,request_id) values($1,'AGING_POLICY_CREATED','AGING_POLICY',$2,'CEO created aging policy',$3::jsonb,current_setting('amaal.request_id',true))`, [actorUserId,rows[0]!.id,JSON.stringify({policy_name:input.policyName,maximum_days:input.maximumDays,warning_days:input.warningDays,critical_overdue_days:input.criticalOverdueDays,band_config:bandConfig,suspension_config:suspensionConfig,auto_recovery_enabled:input.autoRecoveryEnabled ?? true})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('AGING_POLICY_CREATED','AGING_POLICY',$1,$2,$3::jsonb)`, [rows[0]!.id,actorUserId,JSON.stringify({policy_id:rows[0]!.id,organization_id:orgRows[0]!.organization_id})]);
    return {id:rows[0]!.id};
  }

  async listSuspensions(tx: DatabaseTransaction, actorUserId: string, activeOnly = true, limit = 100) {
    const context = await loadAuthorizationContext(tx, actorUserId);
    if (!context.roles.includes('CEO') && !context.roles.includes('ADMIN')) throw new AuthorizationError('Only CEO/Admin can view the full suspension ledger.');
    const take=limitOf(limit);
    const params=activeOnly ? [take] : [take];
    return tx.query<Record<string,unknown>>(
      `select bas.id,bas.user_id as "userId",p.display_name as "userName",ra.role,bas.status,bas.suspension_source as "suspensionSource",bas.reason,bas.policy_snapshot as "policySnapshot",bas.suspended_at as "suspendedAt",bas.reinstated_at as "reinstatedAt",rp.display_name as "reinstatedByName",bas.reinstatement_reason as "reinstatementReason",bas.source_imei_id as "sourceImeiId",i.imei as "sourceImei"
       from public.business_access_suspensions bas join public.profiles p on p.user_id=bas.user_id
       left join lateral(select role from public.role_assignments rax where rax.user_id=bas.user_id and rax.status='ACTIVE' order by rax.effective_from desc limit 1) ra on true
       left join public.profiles rp on rp.user_id=bas.reinstated_by left join public.imei_units i on i.id=bas.source_imei_id
       where ${activeOnly ? "bas.status='ACTIVE'" : '1=1'} order by bas.suspended_at desc limit $1`, params);
  }

  async reassignCase(tx: DatabaseTransaction, actorUserId: string, caseId: string, officerUserId: string, reason: string): Promise<void> {
    if (!reason.trim()) throw new ValidationError('Assignment reason is required.');
    const context = await loadAuthorizationContext(tx, actorUserId);
    const current = await tx.query<{id:string; status:string; assigned_officer_user_id:string|null; region_id:string|null}>(
      `select rc.id,rc.status,rc.assigned_officer_user_id,i.current_region_id as region_id from public.recovery_cases rc join public.imei_units i on i.id=rc.imei_id where rc.id=$1 for update`,[caseId]);
    if (current.length!==1) throw new ValidationError('Recovery case not found.');
    const caseRegionId = current[0]!.region_id;
    const auth = authorize(context, 'recovery.assign', { regionId: caseRegionId ?? undefined });
    if (!auth.allowed) throw new AuthorizationError(auth.reason);
    if (['CLOSED','CANCELLED'].includes(current[0]!.status)) throw new ConflictError('Closed or cancelled recovery cases cannot be reassigned.');
    const officer=await tx.query<{user_id:string}>(`select ra.user_id from public.role_assignments ra join public.profiles p on p.user_id=ra.user_id where ra.user_id=$1 and ra.role='RECOVERY_OFFICER' and ra.status='ACTIVE' and p.status='ACTIVE' and (ra.effective_to is null or ra.effective_to>now()) and ra.region_id=$2`,[officerUserId,current[0]!.region_id]);
    if (officer.length!==1) throw new ValidationError('Recovery Officer is not active in the case region.');
    if (current[0]!.assigned_officer_user_id===officerUserId) return;
    if (current[0]!.assigned_officer_user_id) await tx.query(`update public.recovery_case_assignments set ended_at=now() where recovery_case_id=$1 and ended_at is null`,[caseId]);
    await tx.query(`insert into public.recovery_case_assignments(recovery_case_id,officer_user_id,assigned_by,assignment_reason) values($1,$2,$3,$4)`,[caseId,officerUserId,actorUserId,reason]);
    await tx.query(`update public.recovery_cases set assigned_officer_user_id=$1,status=case when status='OPEN' then 'ASSIGNED' else status end,updated_at=now() where id=$2`,[officerUserId,caseId]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,reason,new_state,request_id) values($1,'RECOVERY_REASSIGNED','RECOVERY_CASE',$2,$3,$4::jsonb,current_setting('amaal.request_id',true))`,[actorUserId,caseId,reason,JSON.stringify({assigned_officer_user_id:officerUserId})]);
  }

  async reinstateUser(tx: DatabaseTransaction, actorUserId: string, userId: string, reason: string): Promise<void> {
    if (!reason.trim()) throw new ValidationError('Reinstatement reason is required.');
    const context = await loadAuthorizationContext(tx, actorUserId);
    if (!context.roles.includes('CEO') && !context.roles.includes('ADMIN')) throw new AuthorizationError('Only CEO or Admin may reinstate suspended access.');
    const row=await tx.query<{id:string;status:string}>(`select id,status from public.business_access_suspensions where user_id=$1 and status='ACTIVE' order by suspended_at desc limit 1 for update`,[userId]);
    if(row.length!==1) throw new ValidationError('No active business-access suspension exists for this user.');
    await tx.query(`update public.business_access_suspensions set status='REINSTATED',reinstated_at=now(),reinstated_by=$1,reinstatement_reason=$2 where id=$3`,[actorUserId,reason,row[0]!.id]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,reason,new_state,request_id) values($1,'BUSINESS_ACCESS_REINSTATED','USER',$2,$3,$4::jsonb,current_setting('amaal.request_id',true))`,[actorUserId, userId, reason, JSON.stringify({status:'ACTIVE_ACCESS_RESTORED',suspension_id:row[0]!.id})]);
  }
}
