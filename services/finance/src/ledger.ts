import type { DatabaseTransaction } from '@amaal/database';
import { authorize, loadAuthorizationContext, type RoleKey } from '@amaal/permissions';
import { AuthorizationError, ConflictError, ValidationError } from '@amaal/shared';

export type CommissionPolicyInput = {
  policyName: string;
  role?: RoleKey;
  productVariantId?: string;
  calculationType: 'FIXED_AMOUNT'|'PERCENT_OF_SALE';
  rateOrAmount: number;
  conditions?: Record<string, unknown>;
  effectiveFrom: string;
  effectiveTo?: string;
};

export type BonusPolicyInput = {
  policyName: string;
  eligibleRole: RoleKey;
  targetType: 'SALES_COUNT'|'SALES_VALUE';
  targetValue: number;
  bonusType: 'FIXED_AMOUNT';
  bonusValue: number;
  period: 'WEEKLY'|'MONTHLY'|'QUARTERLY';
  conditions?: Record<string, unknown>;
  effectiveFrom: string;
  effectiveTo?: string;
};

function requirePermission(context: Awaited<ReturnType<typeof loadAuthorizationContext>>, permission: string): void {
  const decision = authorize(context, permission);
  if (!decision.allowed) throw new AuthorizationError(decision.reason);
}

async function orgId(tx: DatabaseTransaction, userId: string): Promise<string> {
  const rows = await tx.query<{organization_id:string}>(`select organization_id from public.profiles where user_id=$1 and status='ACTIVE'`,[userId]);
  if(rows.length!==1) throw new AuthorizationError('Actor is not linked to an active organization.');
  return rows[0]!.organization_id;
}

function periodBounds(period: BonusPolicyInput['period'], date: Date): { start: string; end: string } {
  const y=date.getUTCFullYear(); const m=date.getUTCMonth(); const d=date.getUTCDate();
  if(period==='WEEKLY'){
    const day=date.getUTCDay(); const shift=(day+6)%7;
    const startDate=new Date(Date.UTC(y,m,d-shift)); const endDate=new Date(Date.UTC(startDate.getUTCFullYear(),startDate.getUTCMonth(),startDate.getUTCDate()+6));
    return {start:startDate.toISOString().slice(0,10),end:endDate.toISOString().slice(0,10)};
  }
  if(period==='QUARTERLY'){
    const q=Math.floor(m/3); const startDate=new Date(Date.UTC(y,q*3,1)); const endDate=new Date(Date.UTC(y,q*3+3,0));
    return {start:startDate.toISOString().slice(0,10),end:endDate.toISOString().slice(0,10)};
  }
  const startDate=new Date(Date.UTC(y,m,1)); const endDate=new Date(Date.UTC(y,m+1,0));
  return {start:startDate.toISOString().slice(0,10),end:endDate.toISOString().slice(0,10)};
}

export class PostgresFinanceLedgerService {
  async listCommissions(tx: DatabaseTransaction, actorUserId: string, options: { from?:string; to?:string; userId?:string; role?:string; limit?:number } = {}) {
    const context=await loadAuthorizationContext(tx,actorUserId);
    requirePermission(context,'commissions.view');
    const safeLimit=Math.min(Math.max(options.limit??100,1),200);
    const targetUser=options.userId?.trim()||null;
    const role=options.role?.trim()||null;
    const from=options.from?.trim()||null;
    const to=options.to?.trim()||null;
    return tx.query(`
      select c.id as "commissionId",c.sale_id as "saleId",s.sale_number as "saleNumber",
             c.beneficiary_user_id as "beneficiaryUserId",p.display_name as "beneficiaryName",c.beneficiary_role as "beneficiaryRole",
             c.amount,c.status,c.created_at as "createdAt",c.policy_id as "policyId",c.policy_snapshot as "policySnapshot",
             s.sale_datetime as "saleDate",s.team_id as "teamId",t.team_name as "teamName",s.region_id as "regionId",r.region_name as "regionName"
      from public.commissions c join public.sales s on s.id=c.sale_id join public.profiles p on p.user_id=c.beneficiary_user_id
      left join public.teams t on t.id=s.team_id left join public.regions r on r.id=s.region_id
      where private.user_can_access_sale(s.id)
        and ($1::uuid is null or c.beneficiary_user_id=$1)
        and ($2::text is null or c.beneficiary_role::text=$2)
        and ($3::timestamptz is null or s.sale_datetime >= $3)
        and ($4::timestamptz is null or s.sale_datetime < $4)
      order by s.sale_datetime desc,c.created_at desc limit $5`,[targetUser,role,from,to,safeLimit]);
  }

  async listBonuses(tx: DatabaseTransaction, actorUserId: string, limit=100) {
    const context=await loadAuthorizationContext(tx,actorUserId);
    requirePermission(context,'bonuses.view');
    const safeLimit=Math.min(Math.max(limit,1),200);
    return tx.query(`select b.id as "bonusId",b.policy_id as "policyId",b.beneficiary_user_id as "beneficiaryUserId",p.display_name as "beneficiaryName",b.period_start as "periodStart",b.period_end as "periodEnd",b.target_value as "targetValue",b.actual_value as "actualValue",b.qualified,b.amount,b.status,b.qualification_snapshot as "qualificationSnapshot",b.calculated_at as "calculatedAt" from public.bonus_ledger b join public.profiles p on p.user_id=b.beneficiary_user_id where (b.beneficiary_user_id=$1 or $2) order by b.period_end desc,b.calculated_at desc limit $3`,[actorUserId,context.roles.includes('CEO')||context.roles.includes('ADMIN'),safeLimit]);
  }

  async listCommissionPolicies(tx: DatabaseTransaction, actorUserId: string) {
    const context=await loadAuthorizationContext(tx,actorUserId); requirePermission(context,'commissions.view');
    const organizationId=await orgId(tx,actorUserId);
    return tx.query(`select cp.id,cp.policy_name as "policyName",cp.role,cp.product_variant_id as "productVariantId",pv.sku,cp.calculation_type as "calculationType",cp.rate_or_amount as "rateOrAmount",cp.conditions,cp.rule_definition as "ruleDefinition",cp.effective_from as "effectiveFrom",cp.effective_to as "effectiveTo",cp.status,cp.created_by as "createdBy",p.display_name as "createdByName",cp.approved_by as "approvedBy",cp.created_at as "createdAt" from public.commission_policies cp left join public.product_variants pv on pv.id=cp.product_variant_id left join public.profiles p on p.user_id=cp.created_by where cp.organization_id=$1 order by cp.effective_from desc limit 500`,[organizationId]);
  }

  async listBonusPolicies(tx: DatabaseTransaction, actorUserId: string) {
    const context=await loadAuthorizationContext(tx,actorUserId); requirePermission(context,'bonuses.view');
    const organizationId=await orgId(tx,actorUserId);
    return tx.query(`select bp.id,bp.policy_name as "policyName",bp.eligible_role as "eligibleRole",bp.target_type as "targetType",bp.target_value as "targetValue",bp.bonus_type as "bonusType",bp.bonus_value as "bonusValue",bp.period,bp.conditions,bp.rule_definition as "ruleDefinition",bp.effective_from as "effectiveFrom",bp.effective_to as "effectiveTo",bp.status,bp.created_by as "createdBy",p.display_name as "createdByName",bp.approved_by as "approvedBy",bp.created_at as "createdAt" from public.bonus_policies bp left join public.profiles p on p.user_id=bp.created_by where bp.organization_id=$1 order by bp.effective_from desc limit 500`,[organizationId]);
  }

  async createCommissionPolicy(tx: DatabaseTransaction, actorUserId: string, input: CommissionPolicyInput) {
    const context=await loadAuthorizationContext(tx,actorUserId); requirePermission(context,'commissions.manage');
    if(!context.roles.includes('CEO')) throw new AuthorizationError('Only the CEO may create or activate commission policies.');
    if(!input.policyName.trim()) throw new ValidationError('Commission policy name is required.');
    if(!Number.isFinite(input.rateOrAmount) || input.rateOrAmount<0) throw new ValidationError('Commission amount/rate must be non-negative.');
    if(input.calculationType==='PERCENT_OF_SALE' && input.rateOrAmount>100) throw new ValidationError('Commission percentage cannot exceed 100.');
    const organizationId=await orgId(tx,actorUserId);
    const rows=await tx.query<{id:string}>(`insert into public.commission_policies(organization_id,policy_name,role,product_variant_id,calculation_type,rate_or_amount,conditions,rule_definition,effective_from,effective_to,status,created_by,approved_by) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,'ACTIVE',$11,case when $12 then $11 else null end) returning id`,[organizationId,input.policyName.trim(),input.role??null,input.productVariantId??null,input.calculationType,input.rateOrAmount,JSON.stringify(input.conditions??{}),JSON.stringify(input.calculationType==='FIXED_AMOUNT'?{calculation_type:'FIXED_AMOUNT',amount:input.rateOrAmount}:{calculation_type:'PERCENT_OF_SALE',rate:input.rateOrAmount}),input.effectiveFrom,input.effectiveTo||null,actorUserId,context.roles.includes('CEO')]);
    if(rows.length!==1) throw new ValidationError('Commission policy could not be created.');
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id) values($1,'COMMISSION_POLICY_CREATED','COMMISSION_POLICY',$2,$3::jsonb,'Phase 4 commission policy',current_setting('amaal.request_id',true))`,[actorUserId,rows[0]!.id,JSON.stringify(input)]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('COMMISSION_POLICY_CREATED','COMMISSION_POLICY',$1,$2,$3::jsonb)`,[rows[0]!.id,actorUserId,JSON.stringify(input)]);
    return {id:rows[0]!.id};
  }

  async createBonusPolicy(tx: DatabaseTransaction, actorUserId: string, input: BonusPolicyInput) {
    const context=await loadAuthorizationContext(tx,actorUserId); requirePermission(context,'bonuses.manage');
    if(!context.roles.includes('CEO')) throw new AuthorizationError('Only the CEO may create or activate bonus policies.');
    if(!input.policyName.trim()) throw new ValidationError('Bonus policy name is required.');
    if(input.targetValue<0 || input.bonusValue<0) throw new ValidationError('Bonus target and value must be non-negative.');
    const organizationId=await orgId(tx,actorUserId);
    const ruleDefinition={target_type:input.targetType,target_value:input.targetValue,bonus_type:input.bonusType,bonus_value:input.bonusValue,period:input.period,conditions:input.conditions??{}};
    const rows=await tx.query<{id:string}>(`insert into public.bonus_policies(organization_id,policy_name,eligible_role,target_type,target_value,bonus_type,bonus_value,period,conditions,rule_definition,effective_from,effective_to,status,created_by,approved_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,'ACTIVE',$13,case when $14 then $13 else null end) returning id`,[organizationId,input.policyName.trim(),input.eligibleRole,input.targetType,input.targetValue,input.bonusType,input.bonusValue,input.period,JSON.stringify(input.conditions??{}),JSON.stringify(ruleDefinition),input.effectiveFrom,input.effectiveTo||null,actorUserId,context.roles.includes('CEO')]);
    if(rows.length!==1) throw new ValidationError('Bonus policy could not be created.');
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason,request_id) values($1,'BONUS_POLICY_CREATED','BONUS_POLICY',$2,$3::jsonb,'Phase 4 bonus policy',current_setting('amaal.request_id',true))`,[actorUserId,rows[0]!.id,JSON.stringify(input)]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('BONUS_POLICY_CREATED','BONUS_POLICY',$1,$2,$3::jsonb)`,[rows[0]!.id,actorUserId,JSON.stringify(input)]);
    return {id:rows[0]!.id};
  }

  async evaluateBonusesForSale(tx: DatabaseTransaction, input: {organizationId:string; beneficiaryUserId:string; saleId:string; totalAmount:number; saleDate:Date}) {
    const roleRows=await tx.query<{role:RoleKey}>(`select role from public.role_assignments where user_id=$1 and status='ACTIVE' and (effective_to is null or effective_to>now()) order by case role when 'SHOP_OWNER' then 0 when 'AGENT' then 1 when 'TEAM_LEADER' then 2 when 'MANAGER' then 3 when 'REGIONAL_MANAGER' then 4 else 9 end limit 1`,[input.beneficiaryUserId]);
    const role=roleRows[0]?.role; if(!role) return [];
    const policies=await tx.query<{id:string;target_type:string;target_value:string;bonus_type:string;bonus_value:string;period:string;effective_from:string;effective_to:string|null;rule_definition:Record<string,unknown>}>(`select id,target_type,target_value::text,bonus_type,bonus_value::text,period,effective_from,effective_to,rule_definition from public.bonus_policies where organization_id=$1 and status='ACTIVE' and eligible_role=$2 and effective_from<=now() and (effective_to is null or effective_to>now())`,[input.organizationId,role]);
    const created:string[]=[];
    for(const policy of policies){
      const bounds=periodBounds(policy.period as BonusPolicyInput['period'],input.saleDate);
      const conditions = (policy.rule_definition?.conditions && typeof policy.rule_definition.conditions === 'object') ? policy.rule_definition.conditions as Record<string, unknown> : {};
      const minSale = conditions.minSaleAmount !== undefined ? Number(conditions.minSaleAmount) : null;
      const maxSale = conditions.maxSaleAmount !== undefined ? Number(conditions.maxSaleAmount) : null;
      const paymentTypes = Array.isArray(conditions.paymentTypes) ? conditions.paymentTypes.filter((v): v is string => typeof v === 'string') : null;
      if (minSale !== null && !Number.isFinite(minSale)) throw new ValidationError(`Bonus policy ${policy.id} has an invalid minSaleAmount condition.`);
      if (maxSale !== null && !Number.isFinite(maxSale)) throw new ValidationError(`Bonus policy ${policy.id} has an invalid maxSaleAmount condition.`);
      if (paymentTypes && !paymentTypes.every((v) => v === 'CASH' || v === 'LOAN')) throw new ValidationError(`Bonus policy ${policy.id} has an invalid paymentTypes condition.`);
      const actualRows=await tx.query<{actual:string}>(`select case when $1='SALES_COUNT' then count(*)::numeric else coalesce(sum(total_amount),0) end::text as actual
        from public.sales where seller_user_id=$2 and status='COMPLETED' and sale_datetime::date between $3::date and $4::date
          and ($5::numeric is null or total_amount >= $5) and ($6::numeric is null or total_amount <= $6)
          and ($7::text[] is null or payment_type::text = any($7))`,[policy.target_type,input.beneficiaryUserId,bounds.start,bounds.end,minSale,maxSale,paymentTypes]);
      const actual=Number(actualRows[0]?.actual??0); const target=Number(policy.target_value); const qualified=actual>=target; const award=qualified?Number(policy.bonus_value):0;
      const rows=await tx.query<{id:string}>(`insert into public.bonus_ledger(policy_id,beneficiary_user_id,period_start,period_end,target_value,actual_value,qualified,amount,qualification_snapshot) values($1,$2,$3::date,$4::date,$5,$6,$7,$8,$9::jsonb) on conflict(policy_id,beneficiary_user_id,period_start,period_end) do update set actual_value=excluded.actual_value,qualified=excluded.qualified,amount=excluded.amount,qualification_snapshot=excluded.qualification_snapshot,calculated_at=now() returning id`,[policy.id,input.beneficiaryUserId,bounds.start,bounds.end,target,actual,qualified,award,JSON.stringify({saleId:input.saleId,targetType:policy.target_type,targetValue:target,actualValue:actual,qualified})]);
      if(rows.length===1) created.push(rows[0]!.id);
    }
    return created;
  }
}

export { periodBounds };
