import type { DatabaseTransaction } from '@amaal/database';
import { DEFAULT_AGING_BANDS, DEFAULT_SUSPENSION_CONFIG, deriveAgingFlags, resolveAgingBand, qualifiesForAgentSuspension, qualifiesForTeamLeaderSuspension, qualifiesForManagerSuspension, type AgingBandConfig, type SuspensionConfig } from '@amaal/business-rules';
import { randomUUID } from 'node:crypto';

const FIELD_HELD_STATES = ['ALLOCATED_TO_MANAGER','ALLOCATED_TO_TEAM','ALLOCATED_TO_AGENT','ALLOCATED_TO_SHOP'] as const;
const SUSPENDABLE_ROLES = ['AGENT','SHOP_OWNER','TEAM_LEADER','MANAGER'] as const;

type PolicyRow = {
  id:string; organization_id:string; maximum_days:number; warning_days:number; critical_overdue_days:number;
  band_config:AgingBandConfig|null; suspension_config:SuspensionConfig|null; auto_recovery_enabled:boolean;
};

type AgedAssetRow = {
  id:string; imei:string; organization_id:string; state:string; current_holder_user_id:string|null; current_holder_started_at:string|null;
  current_region_id:string|null; current_team_id:string|null; current_shop_id:string|null; field_age_started_at:string|null; aging_due_at:string|null;
  display_name:string|null; team_leader_user_id:string|null; manager_user_id:string|null;
};

function safeBands(config: AgingBandConfig|null): AgingBandConfig { return config ?? DEFAULT_AGING_BANDS; }
function safeSuspension(config: SuspensionConfig|null): SuspensionConfig { return config ?? DEFAULT_SUSPENSION_CONFIG; }

function caseNumber(): string {
  const date = new Date().toISOString().slice(0,10).replaceAll('-','');
  return `REC-${date}-${randomUUID().slice(0,8).toUpperCase()}`;
}

async function notify(tx: DatabaseTransaction, recipientUserId: string, type: string, severity: string, title: string, message: string, resourceType: string, resourceId: string): Promise<void> {
  await tx.query(`insert into public.notifications(recipient_user_id,type,severity,title,message,resource_type,resource_id) values ($1,$2,$3,$4,$5,$6,$7)`,[recipientUserId,type,severity,title,message,resourceType,resourceId]);
}

async function ensureRecoveryCase(tx: DatabaseTransaction, asset: AgedAssetRow, policy: PolicyRow, ageDays: number): Promise<{caseId:string;created:boolean}|null> {
  if (!policy.auto_recovery_enabled || ageDays < policy.maximum_days) return null;
  const existing = await tx.query<{id:string; status:string}>(`select id,status from public.recovery_cases where imei_id=$1 and status not in ('CLOSED','CANCELLED') limit 1`,[asset.id]);
  if (existing.length) return {caseId: existing[0]!.id, created:false};

  const number = caseNumber();
  const inserted = await tx.query<{id:string}>(
    `insert into public.recovery_cases(case_number,imei_id,customer_id,status,priority,reason,due_at,notes)
     select $1,i.id,null,'OPEN',case when $4 >= $5 then 100 else 50 end,
            case when $4 >= $5 then 'CRITICAL AGING AUTOMATED RECOVERY' else 'OVERDUE AGING AUTOMATED RECOVERY' end,
            i.aging_due_at,
            'Automatically opened by Amaal Aging & Recovery Engine.'
     from public.imei_units i where i.id=$2 returning id`,
    [number,asset.id,asset.organization_id,ageDays,policy.maximum_days + policy.critical_overdue_days],
  );
  if (inserted.length !== 1) return null;
  const caseId = inserted[0]!.id;
  await tx.query(`update public.imei_units set state='RECOVERY_PENDING',updated_at=now() where id=$1`,[asset.id]);
  await tx.query(
    `insert into public.inventory_movements(imei_id,from_holder_user_id,from_team_id,from_shop_id,reason,movement_type,requested_by,accepted_by,requested_at,accepted_at,condition_before,condition_after,notes,recovery_case_id)
     select $1,current_holder_user_id,current_team_id,current_shop_id,$2,'RECOVERY',null,null,now(),now(),condition_status,condition_status,$3,$1 from public.imei_units where id=$1`,
    [asset.id,'AUTOMATED_AGING_RECOVERY_TRIGGER',`Aging engine opened recovery case ${caseId}`],
  );
  await tx.query(`insert into public.aging_alerts(imei_id,organization_id,alert_type,severity,recovery_case_id,message) values ($1,$2,'RECOVERY_OPEN',$3,$4,$5) on conflict do nothing`,[asset.id,asset.organization_id,ageDays >= policy.maximum_days + policy.critical_overdue_days ? 'CRITICAL':'ERROR',caseId,`Recovery case ${caseId} automatically opened because IMEI ${asset.imei} is overdue. (${ageDays} field-age days)`]);
  await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id) values (null,'RECOVERY_AUTO_OPENED','RECOVERY_CASE',$1,$2::jsonb,'Aging policy triggered automated recovery',current_setting('amaal.request_id',true))`,[caseId,JSON.stringify({imei_id:asset.id,imei:asset.imei,age_days:ageDays,policy_id:policy.id})]);
  await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,actor_user_id,payload) values ('RECOVERY_AUTO_OPENED','RECOVERY_CASE',$1,$2,null,$3::jsonb)`,[caseId,asset.current_region_id,JSON.stringify({case_id:caseId,imei_id:asset.id,imei:asset.imei,age_days:ageDays,policy_id:policy.id})]);
  return {caseId, created:true};
}

async function autoAssignRecoveryOfficer(tx: DatabaseTransaction, caseId: string, asset: AgedAssetRow): Promise<string|null> {
  if (!asset.current_region_id) return null;
  const existing = await tx.query<{assigned_officer_user_id:string|null}>(`select assigned_officer_user_id from public.recovery_cases where id=$1 for update`,[caseId]);
  if (existing.length===1 && existing[0]!.assigned_officer_user_id) return existing[0]!.assigned_officer_user_id;
  const officers = await tx.query<{user_id:string; active_cases:number}>(
    `select ra.user_id,
      count(rc.id) filter (where rc.status in ('OPEN','ASSIGNED','IN_PROGRESS','PROMISED_RETURN','ESCALATED'))::int as active_cases
     from public.role_assignments ra
     join public.profiles p on p.user_id=ra.user_id and p.status='ACTIVE'
     left join public.recovery_cases rc on rc.assigned_officer_user_id=ra.user_id and rc.status in ('OPEN','ASSIGNED','IN_PROGRESS','PROMISED_RETURN','ESCALATED')
     where ra.role='RECOVERY_OFFICER' and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to>now()) and ra.region_id=$1
     group by ra.user_id order by active_cases asc, ra.user_id asc limit 1`,
    [asset.current_region_id],
  );
  if (!officers.length) return null;
  const officer = officers[0]!;
  await tx.query(`update public.recovery_cases set assigned_officer_user_id=$1,status=case when status='OPEN' then 'ASSIGNED' else status end,updated_at=now() where id=$2`,[officer.user_id,caseId]);
  await tx.query(`insert into public.recovery_case_assignments(recovery_case_id,officer_user_id,assigned_by,assignment_reason) values ($1,$2,null,'Automatic load-balanced aging assignment')`,[caseId,officer.user_id]);
  await notify(tx,officer.user_id,'RECOVERY_ASSIGNED','WARNING','New recovery case assigned',`Recovery case ${caseId} was automatically assigned to you.`,`RECOVERY_CASE`,caseId);
  return officer.user_id;
}

async function createEscalation(tx: DatabaseTransaction, caseId: string, asset: AgedAssetRow, reason: string): Promise<void> {
  if (!asset.current_region_id) return;
  const existing = await tx.query<{id:string}>(`select id from public.recovery_escalations where recovery_case_id=$1 and resolved_at is null limit 1`, [caseId]);
  if (existing.length) return;
  const rm = await tx.query<{user_id:string}>(
    `select ra.user_id from public.role_assignments ra where ra.role='REGIONAL_MANAGER' and ra.region_id=$1 and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to>now()) order by ra.user_id limit 1`,
    [asset.current_region_id],
  );
  if (!rm.length) return;
  await tx.query(`insert into public.recovery_escalations(recovery_case_id,from_role,from_user_id,to_role,to_user_id,escalation_level,reason) values ($1,'RECOVERY_OFFICER',null,'REGIONAL_MANAGER',$2,1,$3)`,[caseId,rm[0]!.user_id,reason]);
  await tx.query(`insert into public.aging_alerts(imei_id,organization_id,alert_type,severity,recovery_case_id,recipient_user_id,message) values ($1,$2,'RECOVERY_ESCALATED','CRITICAL',$3,$4,$5) on conflict do nothing`,[asset.id,asset.organization_id,caseId,rm[0]!.user_id,`Recovery case ${caseId} requires Regional Manager attention because no Recovery Officer was available.`]);
  await notify(tx,rm[0]!.user_id,'RECOVERY_ESCALATED','CRITICAL','Recovery queue escalation',`Recovery case ${caseId} has no available Recovery Officer in your region and requires intervention.`,'RECOVERY_CASE',caseId);
}

async function escalateDueRecoveryCases(tx: DatabaseTransaction, organizationId:string): Promise<number> {
  const due = await tx.query<{id:string;imei_id:string;region_id:string|null;status:string}>(`
    select rc.id,rc.imei_id,i.current_region_id as region_id,rc.status
    from public.recovery_cases rc join public.imei_units i on i.id=rc.imei_id
    join public.profiles hp on hp.user_id=i.current_holder_user_id
    where rc.status in ('IN_PROGRESS','PROMISED_RETURN') and rc.due_at is not null and rc.due_at < now()
      and exists(select 1 from public.organizations o where o.id=$1) and exists(select 1 from public.brands b join public.products p on p.brand_id=b.id join public.product_variants pv on pv.product_id=p.id join public.imei_units ix on ix.product_variant_id=pv.id where ix.id=rc.imei_id and b.organization_id=$1)
      and not exists(select 1 from public.recovery_escalations e where e.recovery_case_id=rc.id and e.resolved_at is null and e.to_role='REGIONAL_MANAGER')`, [organizationId]);
  let count=0;
  for(const item of due){
    if(!item.region_id) continue;
    const rm=await tx.query<{user_id:string}>(`select ra.user_id from public.role_assignments ra where ra.role='REGIONAL_MANAGER' and ra.region_id=$1 and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to>now()) order by ra.user_id limit 1`,[item.region_id]);
    if(!rm.length) continue;
    await tx.query(`insert into public.recovery_escalations(recovery_case_id,from_role,from_user_id,to_role,to_user_id,escalation_level,reason) values($1,'RECOVERY_OFFICER',null,'REGIONAL_MANAGER',$2,2,'Recovery case passed its due date without verified warehouse recovery.')`,[item.id,rm[0]!.user_id]);
    await tx.query(`insert into public.aging_alerts(imei_id,organization_id,alert_type,severity,recovery_case_id,recipient_user_id,message) values($1,$2,'RECOVERY_ESCALATED','CRITICAL',$3,$4,$5) on conflict do nothing`,[item.imei_id,organizationId,item.id,rm[0]!.user_id,`Recovery case ${item.id} passed its due date and requires Regional Manager intervention.`]);
    await notify(tx,rm[0]!.user_id,'RECOVERY_ESCALATED','CRITICAL','Recovery case overdue',`Recovery case ${item.id} has passed its due date without verified warehouse recovery.`,'RECOVERY_CASE',item.id);
    await tx.query(`update public.recovery_cases set status='ESCALATED',updated_at=now() where id=$1`,[item.id]);
    count+=1;
  }
  return count;
}

async function suspendUser(tx: DatabaseTransaction, userId:string, organizationId:string, role:string, policy:PolicyRow, reason:string, imeiId:string|null, teamId:string|null): Promise<void> {
  const existing = await tx.query<{id:string}>(`select id from public.business_access_suspensions where user_id=$1 and status='ACTIVE' limit 1`,[userId]);
  if (existing.length) return;
  await tx.query(`insert into public.business_access_suspensions(user_id,organization_id,suspension_source,source_role,source_imei_id,source_team_id,source_policy_id,reason,policy_snapshot) values ($1,$2,'AGING_POLICY',$3::public.role_key,$4,$5,$6,$7,$8::jsonb)`,[userId,organizationId,role,imeiId,teamId,policy.id,reason,JSON.stringify({maximum_days:policy.maximum_days,warning_days:policy.warning_days,critical_overdue_days:policy.critical_overdue_days,suspension_config:policy.suspension_config})]);
  await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id) values (null,'BUSINESS_ACCESS_SUSPENDED','USER',$1,$2::jsonb,$3,current_setting('amaal.request_id',true))`,[userId,JSON.stringify({status:'SUSPENDED',source:'AGING_POLICY',source_role:role,source_imei_id:imeiId,source_team_id:teamId}),reason]);
  await notify(tx,userId,'ACCOUNT_SUSPENDED','CRITICAL','Amaal access suspended',`Business access was suspended by the aging policy: ${reason}`,'USER',userId);
}

export class AgingRecoveryEngine {
  async evaluate(tx: DatabaseTransaction): Promise<{ organizations:number; evaluated:number; warnings:number; overdue:number; critical:number; casesOpened:number; assignments:number; suspended:number; }> {
    const orgPolicies = await tx.query<PolicyRow>(
      `select distinct on (organization_id) id,organization_id,maximum_days,warning_days,critical_overdue_days,band_config,suspension_config,auto_recovery_enabled
       from public.aging_policies
       where status='ACTIVE' and effective_from<=now() and (effective_to is null or effective_to>now())
       order by organization_id,effective_from desc`,
    );
    let evaluated=0,warnings=0,overdue=0,critical=0,casesOpened=0,assignments=0,suspended=0,escalations=0;
    for (const policy of orgPolicies) {
      const assets = await tx.query<AgedAssetRow>(
        `select i.id,i.imei,b.organization_id,i.state,i.current_holder_user_id,i.current_holder_started_at,i.current_region_id,i.current_team_id,i.current_shop_id,i.field_age_started_at,i.aging_due_at,
          hp.display_name,
          t.manager_user_id,
          tl.user_id as team_leader_user_id
         from public.imei_units i
         join public.product_variants pv on pv.id=i.product_variant_id
         join public.products p on p.id=pv.product_id
         join public.brands b on b.id=p.brand_id
         left join public.profiles hp on hp.user_id=i.current_holder_user_id
         left join public.teams t on t.id=i.current_team_id
         left join lateral(select tm.user_id from public.team_memberships tm where tm.team_id=i.current_team_id and tm.role='TEAM_LEADER' and tm.status='ACTIVE' and (tm.effective_to is null or tm.effective_to>now()) order by tm.effective_from desc limit 1) tl on true
         where b.organization_id=$1 and i.state=any($2::public.imei_state[]) and i.field_age_started_at is not null`,
        [policy.organization_id,FIELD_HELD_STATES],
      );
      const bandConfig=safeBands(policy.band_config);
      const suspensionConfig=safeSuspension(policy.suspension_config);
      for (const asset of assets) {
        evaluated += 1;
        const ageDays = Math.max(1,Math.floor((Date.now()-Date.parse(asset.field_age_started_at!))/86400000));
        const holderAgeDays = asset.current_holder_started_at ? Math.max(0,Math.floor((Date.now()-Date.parse(asset.current_holder_started_at))/86400000)) : 0;
        const band = resolveAgingBand(ageDays,bandConfig);
        const flags = deriveAgingFlags(ageDays,policy.warning_days,policy.maximum_days,policy.critical_overdue_days);
        if(flags.isWarning) warnings += 1;
        if(flags.isOverdue) overdue += 1;
        if(flags.isCritical) critical += 1;
        const prior = await tx.query<{aging_status:string;is_warning:boolean;is_overdue:boolean;is_critical:boolean}>(`select aging_status,is_warning,is_overdue,is_critical from public.aging_asset_states where imei_id=$1 for update`,[asset.id]);
        const changed = prior.length===0 || prior[0]!.aging_status!==band || prior[0]!.is_warning!==flags.isWarning || prior[0]!.is_overdue!==flags.isOverdue || prior[0]!.is_critical!==flags.isCritical;
        await tx.query(
          `insert into public.aging_asset_states(imei_id,organization_id,policy_id,aging_status,total_field_age_days,current_holder_age_days,days_remaining,days_overdue,is_warning,is_overdue,is_critical,last_evaluated_at,last_transition_at,policy_snapshot,updated_at)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),case when $12 then now() else coalesce((select last_transition_at from public.aging_asset_states where imei_id=$1),now()) end,$13::jsonb,now())
           on conflict(imei_id) do update set organization_id=excluded.organization_id,policy_id=excluded.policy_id,aging_status=excluded.aging_status,total_field_age_days=excluded.total_field_age_days,current_holder_age_days=excluded.current_holder_age_days,days_remaining=excluded.days_remaining,days_overdue=excluded.days_overdue,is_warning=excluded.is_warning,is_overdue=excluded.is_overdue,is_critical=excluded.is_critical,last_evaluated_at=excluded.last_evaluated_at,last_transition_at=excluded.last_transition_at,policy_snapshot=excluded.policy_snapshot,updated_at=now()`,
          [asset.id,policy.organization_id,policy.id,band,ageDays,holderAgeDays,flags.daysRemaining,flags.daysOverdue,flags.isWarning,flags.isOverdue,flags.isCritical,changed,JSON.stringify({band_config:bandConfig,suspension_config:suspensionConfig,maximum_days:policy.maximum_days,warning_days:policy.warning_days,critical_overdue_days:policy.critical_overdue_days})],
        );
        if(changed){
          const priorStatus=prior[0]?.aging_status ?? null;
          const eventType=prior.length===0?'BAND_CHANGED':(priorStatus!==band?'BAND_CHANGED':flags.isCritical&&!prior[0]!.isCritical?'CRITICAL_ENTERED':flags.isOverdue&&!prior[0]!.isOverdue?'OVERDUE_ENTERED':flags.isWarning&&!prior[0]!.isWarning?'WARNING_ENTERED':'CRITICAL_EXITED');
          await tx.query(`insert into public.aging_state_events(imei_id,organization_id,from_status,to_status,total_field_age_days,days_overdue,event_type,policy_id,policy_snapshot) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,[asset.id,policy.organization_id,priorStatus,band,ageDays,flags.daysOverdue,eventType,policy.id,JSON.stringify({band_config:bandConfig,suspension_config:suspensionConfig})]);
        }
        if(asset.current_holder_user_id && flags.isWarning && changed){
          await notify(tx,asset.current_holder_user_id,'AGING_WARNING',flags.isCritical?'CRITICAL':flags.isOverdue?'ERROR':'WARNING',`${band} aging alert for ${asset.imei}`,`IMEI ${asset.imei} is ${ageDays} field-age days old. ${flags.daysOverdue>0?`${flags.daysOverdue} day(s) overdue.`:`${flags.daysRemaining} day(s) remaining before maximum age.`}`,'IMEI',asset.id);
        }
        if(flags.isOverdue){
          const recovery=await ensureRecoveryCase(tx,asset,policy,ageDays);
          if(recovery){ if(recovery.created) casesOpened += 1; const assigned=await autoAssignRecoveryOfficer(tx,recovery.caseId,asset); if(assigned && recovery.created) assignments += 1; else if(!assigned) await createEscalation(tx,recovery.caseId,asset,'No active Recovery Officer available for automatic assignment.'); }
        }
      }
      escalations += await escalateDueRecoveryCases(tx, policy.organization_id);
      // Notify the management chain when critical stock crosses a threshold; this is read-only intelligence and does not grant new authority.
      for (const asset of assets) {
        const criticalRow = await tx.query<{is_critical:boolean}>(`select is_critical from public.aging_asset_states where imei_id=$1`, [asset.id]);
        const criticalEntered = await tx.query<{id:string}>(`select id from public.aging_state_events where imei_id=$1 and event_type='CRITICAL_ENTERED' and created_at > now()-interval '90 seconds' limit 1`, [asset.id]);
        if (criticalRow[0]?.is_critical && criticalEntered.length && asset.team_leader_user_id) await notify(tx,asset.team_leader_user_id,'AGING_CRITICAL','CRITICAL','Critical aging on team stock',`IMEI ${asset.imei} is critically aged and requires recovery attention.`,'IMEI',asset.id);
        if (criticalRow[0]?.is_critical && criticalEntered.length && asset.manager_user_id) await notify(tx,asset.manager_user_id,'AGING_CRITICAL','CRITICAL','Critical aging in managed team',`IMEI ${asset.imei} is critically aged within your managed team.`,'IMEI',asset.id);
      }
      // Suspension evaluation is computed from the current aging state, not from raw rows, so the same policy snapshot drives decisions.
      for (const role of SUSPENDABLE_ROLES) {
        if(role==='AGENT' || role==='SHOP_OWNER') {
          const holders = await tx.query<{user_id:string;critical_count:number;oldest_critical_days:number;team_id:string|null;organization_id:string}>(
            `select i.current_holder_user_id as user_id,count(*)::int as critical_count,max(s.total_field_age_days)::int as oldest_critical_days,max(i.current_team_id) as team_id,max($1::uuid) as organization_id
             from public.imei_units i join public.aging_asset_states s on s.imei_id=i.id
             where i.current_holder_user_id is not null and s.organization_id=$1 and s.is_critical=true and i.state=any($2::public.imei_state[])
               and exists(select 1 from public.role_assignments ra where ra.user_id=i.current_holder_user_id and ra.role=$3::public.role_key and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to>now()))
             group by i.current_holder_user_id`,
            [policy.organization_id,FIELD_HELD_STATES,role],
          );
          for(const h of holders){ if(qualifiesForAgentSuspension(h.critical_count,h.oldest_critical_days,suspensionConfig)){ await suspendUser(tx,h.user_id,policy.organization_id,role,policy,`Critical aging threshold met: ${h.critical_count} critical device(s), oldest ${h.oldest_critical_days} day(s).`,null,h.team_id); suspended += 1; } }
        } else if(role==='TEAM_LEADER') {
          const tls = await tx.query<{user_id:string;critical_agents:number;critical_devices:number;team_id:string}>(
            `select tm.user_id,count(distinct i.current_holder_user_id)::int as critical_agents,count(i.id)::int as critical_devices,tm.team_id
             from public.team_memberships tm join public.teams t on t.id=tm.team_id
             join public.imei_units i on i.current_team_id=t.id join public.aging_asset_states s on s.imei_id=i.id and s.is_critical=true
             where t.region_id in (select id from public.regions where organization_id=$1) and tm.role='TEAM_LEADER' and tm.status='ACTIVE' and (tm.effective_to is null or tm.effective_to>now())
             group by tm.user_id,tm.team_id`,[policy.organization_id],
          );
          for(const tl of tls){ if(qualifiesForTeamLeaderSuspension(tl.critical_agents,tl.critical_devices,suspensionConfig)){ await suspendUser(tx,tl.user_id,policy.organization_id,'TEAM_LEADER',policy,`Team aging escalation threshold met: ${tl.critical_agents} critical aged agents / ${tl.critical_devices} critical devices.`,null,tl.team_id); suspended += 1; } }
        } else {
          const managers = await tx.query<{user_id:string;aged_teams:number}>(
            `select t.manager_user_id as user_id,count(distinct t.id)::int as aged_teams
             from public.teams t join public.imei_units i on i.current_team_id=t.id join public.aging_asset_states s on s.imei_id=i.id and s.is_critical=true
             where t.region_id in (select id from public.regions where organization_id=$1) and t.status='ACTIVE' group by t.manager_user_id`,[policy.organization_id],
          );
          for(const m of managers){ if(qualifiesForManagerSuspension(m.aged_teams,suspensionConfig)){ await suspendUser(tx,m.user_id,policy.organization_id,'MANAGER',policy,`Manager aging threshold met: ${m.aged_teams} team(s) contain critical aged stock.`,null,null); suspended += 1; } }
        }
      }
    }
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id) values (null,'AGING_ENGINE_EVALUATED','AGING_ENGINE',null,$1::jsonb,'Scheduled aging/recovery evaluation completed',current_setting('amaal.request_id',true))`,[JSON.stringify({organizations:orgPolicies.length,evaluated,warnings,overdue,critical,casesOpened,assignments,suspended})]);
    return {organizations:orgPolicies.length,evaluated,warnings,overdue,critical,casesOpened,assignments,escalations,suspended};
  }
}
