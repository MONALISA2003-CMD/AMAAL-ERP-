import type { DatabaseTransaction } from '@amaal/database';
import { AuthorizationError, ValidationError } from '@amaal/shared';
import { authorize, loadAuthorizationContext, type AuthorizationContext } from '@amaal/permissions';
import { AI_TOOL_POLICIES } from './contracts.ts';
import { searchAmaalKnowledge } from './knowledge.ts';

export type AmaalAIReadTool =
  | 'get_my_stock'
  | 'get_team_stock'
  | 'get_region_stock'
  | 'find_imei'
  | 'get_imei_history'
  | 'get_sales'
  | 'get_commission'
  | 'get_aging'
  | 'get_recovery_queue'
  | 'get_customer'
  | 'compare_performance'
  | 'generate_report'
  | 'search_knowledge';

export type AmaalAIActionTool =
  | 'create_task'
  | 'create_recovery_case'
  | 'prepare_transfer_request'
  | 'prepare_adjustment_request'
  | 'prepare_approval_request';

export type AmaalAIToolName = AmaalAIReadTool | AmaalAIActionTool;

export type AmaalAIToolCall = {
  tool: AmaalAIToolName;
  args: Record<string, unknown>;
};

export type AmaalAIToolResult = {
  tool: AmaalAIToolName;
  data: unknown;
  trace: { actorUserId: string; authorization: string };
};

function requireAiUse(context: AuthorizationContext): void {
  const decision = authorize(context, 'ai.use');
  if (!decision.allowed) throw new AuthorizationError(decision.reason);
}

function requireAiExecute(context: AuthorizationContext): void {
  const decision = authorize(context, 'ai.execute');
  if (!decision.allowed) throw new AuthorizationError(decision.reason);
}

function asString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${key} is required.`);
  return value.trim();
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value == null) return undefined;
  if (typeof value !== 'string') throw new ValidationError(`${key} must be a string or null.`);
  const trimmed = value.trim();
  return trimmed || undefined;
}

function nonNegativeInt(args: Record<string, unknown>, key: string, fallback = 0): number {
  const raw = Number(args[key] ?? fallback);
  if (!Number.isFinite(raw) || raw < 0) throw new ValidationError(`${key} must be a non-negative number.`);
  return Math.trunc(raw);
}

function limitArg(args: Record<string, unknown>): number {
  const raw = Number(args.limit ?? 50);
  if (!Number.isFinite(raw)) throw new ValidationError('limit must be a number.');
  return Math.min(Math.max(Math.trunc(raw), 1), 200);
}

function organizationIdSubquery(): string {
  return `(select organization_id from public.profiles where user_id=auth.uid() and status='ACTIVE' limit 1)`;
}

function organizationClause(alias: string): string {
  return `and ${alias}.organization_id=${organizationIdSubquery()}`;
}

function inventoryOrganizationClause(alias = 'i'): string {
  return `and exists (
    select 1
    from public.product_variants pv_org
    join public.products p_org on p_org.id=pv_org.product_id
    where pv_org.id=${alias}.product_variant_id
      and p_org.organization_id=${organizationIdSubquery()}
  )`;
}

function commissionOrganizationClause(): string {
  return `exists (
    select 1
    from public.sales s_org
    where s_org.id=c.sale_id
      and s_org.organization_id=${organizationIdSubquery()}
  )`;
}

function salesScope(context: AuthorizationContext, actorUserId: string): { clause: string; params: unknown[]; authorization: string } {
  if (context.roles.includes('CEO')) return { clause: '', params: [], authorization: 'CEO company-wide authority' };
  if (context.roles.includes('ADMIN')) return { clause: '', params: [], authorization: 'Admin company-wide reporting scope' };
  if (context.roles.includes('REGIONAL_MANAGER')) {
    if (!context.regionIds.length) return { clause: 'and false', params: [], authorization: 'Regional Manager has no active Region scope' };
    return { clause: 'and s.region_id = any($1::uuid[])', params: [context.regionIds], authorization: 'Regional sales scope' };
  }
  if (context.roles.includes('MANAGER') || context.roles.includes('TEAM_LEADER')) {
    if (!context.teamIds.length) return { clause: 'and false', params: [], authorization: 'Operational role has no active Team scope' };
    return { clause: 'and s.team_id = any($1::uuid[])', params: [context.teamIds], authorization: 'Team sales scope' };
  }
  if (context.roles.includes('RECOVERY_OFFICER')) {
    return {
      clause: `and exists (
        select 1 from public.recovery_cases rc
        where rc.customer_id = s.customer_id
          and rc.assigned_officer_user_id = $1
      )`,
      params: [actorUserId],
      authorization: 'Recovery case-linked sales scope',
    };
  }
  return { clause: 'and s.seller_user_id = $1', params: [actorUserId], authorization: 'Seller-owned sales scope' };
}

function inventoryScope(context: AuthorizationContext, actorUserId: string, alias = 'i'): { clause: string; params: unknown[]; authorization: string } {
  if (context.roles.includes('CEO')) return { clause: '', params: [], authorization: 'CEO company-wide authority' };
  if (context.roles.includes('ADMIN')) return { clause: '', params: [], authorization: 'Admin inventory scope' };
  if (context.roles.includes('REGIONAL_MANAGER')) {
    if (!context.regionIds.length) return { clause: 'and false', params: [], authorization: 'Regional Manager has no active Region scope' };
    return { clause: `and ${alias}.current_region_id = any($1::uuid[])`, params: [context.regionIds], authorization: 'Regional inventory scope' };
  }
  if (context.roles.includes('MANAGER') || context.roles.includes('TEAM_LEADER')) {
    if (!context.teamIds.length) return { clause: 'and false', params: [], authorization: 'Operational role has no active Team scope' };
    return {
      clause: `and exists (
        select 1 from public.team_memberships tm_scope
        where tm_scope.user_id = ${alias}.current_holder_user_id
          and tm_scope.team_id = any($1::uuid[])
          and tm_scope.status='ACTIVE'
      )`,
      params: [context.teamIds],
      authorization: 'Team inventory scope',
    };
  }
  return { clause: `and ${alias}.current_holder_user_id = $1`, params: [actorUserId], authorization: 'Holder-owned inventory scope' };
}

function recoveryScope(context: AuthorizationContext, actorUserId: string): { join: string; clause: string; params: unknown[]; authorization: string } {
  if (context.roles.includes('CEO')) return { join: '', clause: '', params: [], authorization: 'CEO company-wide authority' };
  if (context.roles.includes('ADMIN')) return { join: '', clause: '', params: [], authorization: 'Admin recovery scope' };
  if (context.roles.includes('REGIONAL_MANAGER')) {
    if (!context.regionIds.length) return { join: '', clause: 'and false', params: [], authorization: 'Regional Manager has no active Region scope' };
    return {
      join: 'join public.imei_units i_scope on i_scope.id = rc.imei_id',
      clause: 'and i_scope.current_region_id = any($1::uuid[])',
      params: [context.regionIds],
      authorization: 'Regional recovery scope',
    };
  }
  if (context.roles.includes('MANAGER') || context.roles.includes('TEAM_LEADER')) {
    if (!context.teamIds.length) return { join: '', clause: 'and false', params: [], authorization: 'Operational role has no active Team scope' };
    return {
      join: `join public.imei_units i_scope on i_scope.id = rc.imei_id
             and exists (
               select 1 from public.team_memberships tm_scope
               where tm_scope.user_id = i_scope.current_holder_user_id
                 and tm_scope.team_id = any($1::uuid[])
                 and tm_scope.status='ACTIVE'
             )`,
      clause: '',
      params: [context.teamIds],
      authorization: 'Team recovery scope',
    };
  }
  if (context.roles.includes('RECOVERY_OFFICER')) {
    return { join: '', clause: 'and rc.assigned_officer_user_id = $1', params: [actorUserId], authorization: 'Assigned recovery scope' };
  }
  return {
    join: 'join public.imei_units i_scope on i_scope.id = rc.imei_id',
    clause: 'and i_scope.current_holder_user_id = $1',
    params: [actorUserId],
    authorization: 'Holder-owned recovery scope',
  };
}

function commissionScope(context: AuthorizationContext, actorUserId: string, requestedUserId?: string): { clause: string; params: unknown[]; authorization: string } {
  const org = commissionOrganizationClause();
  if (requestedUserId) {
    if (context.roles.includes('CEO')) return { clause: `where c.beneficiary_user_id = $1 and ${org}`, params: [requestedUserId], authorization: 'CEO company-wide commission scope' };
    if (context.roles.includes('ADMIN')) return { clause: `where c.beneficiary_user_id = $1 and ${org}`, params: [requestedUserId], authorization: 'Admin commission scope' };
    if (context.roles.includes('REGIONAL_MANAGER') && context.regionIds.length) {
      return {
        clause: `where c.beneficiary_user_id = $1 and ${org} and exists (
          select 1 from public.role_assignments ra_scope
          where ra_scope.user_id = c.beneficiary_user_id
            and ra_scope.status='ACTIVE'
            and ra_scope.region_id = any($2::uuid[])
        )`,
        params: [requestedUserId, context.regionIds],
        authorization: 'Regional commission scope',
      };
    }
    if ((context.roles.includes('MANAGER') || context.roles.includes('TEAM_LEADER')) && context.teamIds.length) {
      return {
        clause: `where c.beneficiary_user_id = $1 and ${org} and exists (
          select 1 from public.team_memberships tm_scope
          where tm_scope.user_id = c.beneficiary_user_id
            and tm_scope.team_id = any($2::uuid[])
            and tm_scope.status='ACTIVE'
        )`,
        params: [requestedUserId, context.teamIds],
        authorization: 'Team commission scope',
      };
    }
    if (requestedUserId !== actorUserId) throw new AuthorizationError('Requested commission beneficiary is outside your scope.');
  }
  return { clause: `where c.beneficiary_user_id = $1 and ${org}`, params: [actorUserId], authorization: 'Own commission scope' };
}

function validateCreateRecoveryArguments(args: Record<string, unknown>): void {
  asString(args, 'imeiId');
  asString(args, 'reason');
  nonNegativeInt(args, 'priority', 0);
  optionalString(args, 'customerId');
  optionalString(args, 'dueAt');
  optionalString(args, 'notes');
}

export class AmaalAIToolGateway {
  constructor(private readonly tx: DatabaseTransaction, private readonly actorUserId: string) {}

  private async context(): Promise<AuthorizationContext> {
    const context = await loadAuthorizationContext(this.tx, this.actorUserId);
    requireAiUse(context);
    return context;
  }

  async call(call: AmaalAIToolCall): Promise<AmaalAIToolResult> {
    const context = await this.context();
    const policy = AI_TOOL_POLICIES[call.tool];
    for (const permission of policy.requiredPermissions) {
      const decision = authorize(context, permission);
      if (!decision.allowed) throw new AuthorizationError(decision.reason);
    }

    switch (call.tool) {
      case 'get_my_stock': {
        const decision = authorize(context, 'inventory.view', { ownerUserId: this.actorUserId });
        if (!decision.allowed) throw new AuthorizationError(decision.reason);
        const data = await this.tx.query(
          `select i.id,i.imei,i.state,i.current_region_id,i.current_warehouse_id,i.field_age_started_at,i.current_holder_started_at,i.aging_due_at,i.condition_status
           from public.imei_units i
           where i.current_holder_user_id=$1 ${inventoryOrganizationClause('i')}
           order by i.updated_at desc limit 200`, [this.actorUserId],
        );
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization: decision.reason } };
      }

      case 'get_team_stock': {
        const teamId = asString(call.args, 'teamId');
        const decision = authorize(context, 'inventory.view', { teamId });
        if (!decision.allowed) throw new AuthorizationError(decision.reason);
        const data = await this.tx.query(
          `select i.id,i.imei,i.state,i.current_holder_user_id,i.current_region_id,i.current_warehouse_id,i.field_age_started_at,i.aging_due_at,i.condition_status
           from public.imei_units i
           join public.team_memberships tm on tm.user_id=i.current_holder_user_id and tm.team_id=$1 and tm.status='ACTIVE'
           where 1=1 ${inventoryOrganizationClause('i')}
           order by i.updated_at desc limit 200`, [teamId],
        );
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization: decision.reason } };
      }

      case 'get_region_stock': {
        const regionId = asString(call.args, 'regionId');
        const decision = authorize(context, 'inventory.view', { regionId });
        if (!decision.allowed) throw new AuthorizationError(decision.reason);
        const data = await this.tx.query(
          `select i.id,i.imei,i.state,i.current_holder_user_id,i.current_region_id,i.current_warehouse_id,i.field_age_started_at,i.aging_due_at,i.condition_status
           from public.imei_units i
           where i.current_region_id=$1 ${inventoryOrganizationClause('i')}
           order by i.updated_at desc limit 200`, [regionId],
        );
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization: decision.reason } };
      }

      case 'find_imei': {
        const imei = asString(call.args, 'imei');
        const rows = await this.tx.query<{ id:string; state:string; current_holder_user_id:string|null; current_region_id:string|null; current_warehouse_id:string|null }>(
          `select i.id,i.state,i.current_holder_user_id,i.current_region_id,i.current_warehouse_id
           from public.imei_units i
           where i.imei=$1 ${inventoryOrganizationClause('i')}`,
          [imei],
        );
        if (!rows.length) return { tool: call.tool, data: [], trace: { actorUserId: this.actorUserId, authorization: 'IMEI not found' } };
        const row = rows[0]!;
        const decision = authorize(context, 'inventory.view', {
          ...(row.current_holder_user_id ? { ownerUserId: row.current_holder_user_id } : {}),
          ...(row.current_region_id ? { regionId: row.current_region_id } : {}),
        });
        if (!decision.allowed) return { tool: call.tool, data: [], trace: { actorUserId: this.actorUserId, authorization: 'IMEI not found' } };
        return { tool: call.tool, data: rows, trace: { actorUserId: this.actorUserId, authorization: decision.reason } };
      }

      case 'get_imei_history': {
        const imeiId = asString(call.args, 'imeiId');
        const rows = await this.tx.query<{ current_holder_user_id:string|null; current_region_id:string|null; state:string }>(
          `select i.current_holder_user_id,i.current_region_id,i.state
           from public.imei_units i
           where i.id=$1 ${inventoryOrganizationClause('i')}`,
          [imeiId],
        );
        if (!rows.length) throw new ValidationError('IMEI not found.');
        const row = rows[0]!;
        let decision = authorize(context, 'inventory.view', {
          ...(row.current_holder_user_id ? { ownerUserId: row.current_holder_user_id } : {}),
          ...(row.current_region_id ? { regionId: row.current_region_id } : {}),
        });
        if (!decision.allowed && row.state === 'SOLD') {
          const sellerRows = await this.tx.query<{ seller_user_id:string; region_id:string|null; team_id:string|null }>(
            `select s.seller_user_id,s.region_id,s.team_id
             from public.sales s join public.sale_items si on si.sale_id=s.id
             where si.imei_id=$1 and ${organizationClause('s').replace(/^and /,'')} order by s.completed_at desc nulls last limit 1`,
            [imeiId],
          );
          const sale = sellerRows[0];
          if (sale) decision = authorize(context, 'sales.view', { ownerUserId: sale.seller_user_id, ...(sale.team_id ? { teamId: sale.team_id } : {}), ...(sale.region_id ? { regionId: sale.region_id } : {}) });
        }
        if (!decision.allowed) throw new AuthorizationError(decision.reason);
        const data = await this.tx.query(
          `select m.id,m.imei_id,m.from_holder_user_id,m.to_holder_user_id,m.from_warehouse_id,m.to_warehouse_id,m.movement_type,m.reason,m.requested_by,m.approved_by,m.accepted_by,m.requested_at,m.approved_at,m.accepted_at,m.condition_before,m.condition_after,m.approval_id,m.recovery_case_id,m.allocation_id,m.created_at
           from public.inventory_movements m
           where m.imei_id=$1
             and exists (
               select 1 from public.imei_units i_org
               join public.product_variants pv_org on pv_org.id=i_org.product_variant_id
               join public.products p_org on p_org.id=pv_org.product_id
               where i_org.id=m.imei_id and p_org.organization_id=${organizationIdSubquery()}
             )
           order by m.created_at asc limit 500`,
          [imeiId],
        );
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization: decision.reason } };
      }

      case 'get_sales': {
        const limit = limitArg(call.args);
        const scope = salesScope(context, this.actorUserId);
        const offset = scope.params.length + 1;
        const params = [...scope.params, limit];
        const data = await this.tx.query(
          `select s.id,s.sale_number,s.seller_user_id,s.customer_id,s.status,s.payment_type,s.total_amount,s.completed_at
           from public.sales s
           where s.organization_id=${organizationIdSubquery()} ${scope.clause}
           order by s.completed_at desc nulls last
           limit $${offset}`,
          params,
        );
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization: scope.authorization } };
      }

      case 'get_commission': {
        const requestedUserId = typeof call.args.userId === 'string' && call.args.userId.trim() ? call.args.userId.trim() : undefined;
        const scope = commissionScope(context, this.actorUserId, requestedUserId);
        const data = await this.tx.query(
          `select c.id,c.sale_id,c.beneficiary_user_id,c.beneficiary_role,c.policy_id,c.amount,c.policy_snapshot,c.created_at
           from public.commissions c ${scope.clause}
           order by c.created_at desc limit 200`, scope.params,
        );
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization: scope.authorization } };
      }

      case 'get_aging': {
        const scope = inventoryScope(context, this.actorUserId);
        const data = await this.tx.query(
          `select i.id,i.imei,i.state,i.current_holder_user_id,i.current_region_id,i.current_warehouse_id,i.field_age_started_at,i.current_holder_started_at,i.aging_due_at
           from public.imei_units i
           where i.state not in ('SOLD') ${inventoryOrganizationClause('i')} ${scope.clause}
           order by i.aging_due_at asc nulls last limit 200`, scope.params,
        );
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization: scope.authorization } };
      }

      case 'get_recovery_queue': {
        const scope = recoveryScope(context, this.actorUserId);
        const data = await this.tx.query(
          `select rc.id,rc.case_number,rc.imei_id,rc.customer_id,rc.assigned_officer_user_id,rc.status,rc.priority,rc.due_at,rc.opened_at
           from public.recovery_cases rc ${scope.join}
           where exists (
             select 1 from public.imei_units i_org
             join public.product_variants pv_org on pv_org.id=i_org.product_variant_id
             join public.products p_org on p_org.id=pv_org.product_id
             where i_org.id=rc.imei_id and p_org.organization_id=${organizationIdSubquery()}
           )
             and rc.status not in ('CLOSED','CANCELLED') ${scope.clause}
           order by rc.priority desc,rc.due_at asc nulls last limit 200`, scope.params,
        );
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization: scope.authorization } };
      }

      case 'get_customer': {
        const customerId = asString(call.args, 'customerId');
        const rows = await this.tx.query<{ id:string; created_by:string; region_id:string|null; team_id:string|null }>(
          `select c.id,c.created_by,coalesce(ra.region_id,t.region_id) as region_id,coalesce(ra.team_id,tm.team_id) as team_id
           from public.customers c
           left join public.role_assignments ra on ra.user_id=c.created_by and ra.status='ACTIVE'
           left join public.team_memberships tm on tm.user_id=c.created_by and tm.status='ACTIVE'
           left join public.teams t on t.id=coalesce(ra.team_id,tm.team_id)
           where c.id=$1 and c.organization_id=${organizationIdSubquery()} limit 1`, [customerId],
        );
        if (!rows.length) throw new ValidationError('Customer not found.');
        const row = rows[0]!;
        const decision = authorize(context, 'customers.view', { ownerUserId: row.created_by, ...(row.team_id ? { teamId: row.team_id } : {}), ...(row.region_id ? { regionId: row.region_id } : {}) });
        if (!decision.allowed) throw new AuthorizationError(decision.reason);
        const data = await this.tx.query(`select id,customer_number,full_name,phone,alternative_phone,email,address,customer_type,consent_status,status,created_at,updated_at from public.customers where id=$1 and organization_id=${organizationIdSubquery()}`, [customerId]);
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization: decision.reason } };
      }

      case 'compare_performance': {
        const decision = authorize(context, 'reports.view');
        if (!decision.allowed) throw new AuthorizationError(decision.reason);
        const limit = limitArg(call.args);
        const scope = salesScope(context, this.actorUserId);
        const offset = scope.params.length + 1;
        const data = await this.tx.query(
          `select s.seller_user_id,date_trunc('month',s.completed_at) as month,count(*)::bigint as units,coalesce(sum(s.total_amount),0)::numeric as revenue
           from public.sales s
           where s.status='COMPLETED' and s.organization_id=${organizationIdSubquery()} ${scope.clause}
           group by s.seller_user_id,date_trunc('month',s.completed_at)
           order by month desc,revenue desc limit $${offset}`,
          [...scope.params, limit],
        );
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization: scope.authorization } };
      }

      case 'generate_report': {
        const report = asString(call.args, 'report');
        const allowed = new Set(['sales_summary','inventory_summary','recovery_summary','commission_summary']);
        if (!allowed.has(report)) throw new ValidationError('Unsupported report type.');
        const decision = authorize(context, 'reports.view');
        if (!decision.allowed) throw new AuthorizationError(decision.reason);
        let data: unknown;
        let authorization = decision.reason;
        if (report === 'sales_summary') {
          const scope = salesScope(context, this.actorUserId);
          data = await this.tx.query(`select count(*)::bigint as sales_count,coalesce(sum(s.total_amount),0)::numeric as revenue from public.sales s where s.status='COMPLETED' and s.organization_id=${organizationIdSubquery()} ${scope.clause}`, scope.params);
          authorization = scope.authorization;
        } else if (report === 'inventory_summary') {
          const scope = inventoryScope(context, this.actorUserId);
          data = await this.tx.query(`select i.state,count(*)::bigint as units from public.imei_units i where 1=1 ${inventoryOrganizationClause('i')} ${scope.clause} group by i.state order by i.state`, scope.params);
          authorization = scope.authorization;
        } else if (report === 'recovery_summary') {
          const scope = recoveryScope(context, this.actorUserId);
          data = await this.tx.query(`select rc.status,count(*)::bigint as cases from public.recovery_cases rc ${scope.join} where exists (select 1 from public.imei_units i_org join public.product_variants pv_org on pv_org.id=i_org.product_variant_id join public.products p_org on p_org.id=pv_org.product_id where i_org.id=rc.imei_id and p_org.organization_id=${organizationIdSubquery()}) ${scope.clause} group by rc.status order by rc.status`, scope.params);
          authorization = scope.authorization;
        } else {
          const scope = commissionScope(context, this.actorUserId);
          data = await this.tx.query(`select c.beneficiary_user_id,coalesce(sum(c.amount),0)::numeric as commission from public.commissions c ${scope.clause} group by c.beneficiary_user_id order by commission desc`, scope.params);
          authorization = scope.authorization;
        }
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization } };
      }

      case 'search_knowledge': {
        const query = asString(call.args, 'query');
        const limit = limitArg(call.args);
        const data = await searchAmaalKnowledge(this.tx, this.actorUserId, query, Math.min(limit, 20));
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization: 'Permission-aware Amaal knowledge scope' } };
      }

      case 'get_demand_forecast':
      case 'get_aging_risk':
      case 'get_recovery_priority':
      case 'get_stock_optimization':
      case 'get_anomalies': {
        const permission = policy.requiredPermissions.find((item) => item === 'ai.intelligence.view') ?? 'ai.intelligence.view';
        const decision = authorize(context, permission);
        if (!decision.allowed) throw new AuthorizationError(decision.reason);
        const limit = limitArg(call.args);
        const installed = await this.tx.query<{exists:boolean}>(
          `select exists(select 1 from information_schema.tables where table_schema='public' and table_name='ml_predictions') as exists`,
        );
        if (!installed[0]?.exists) {
          return { tool: call.tool, data: { mode:'FOUNDATION_ONLY', items:[], notice:'Stage 9 prediction read model is not installed in this database yet.' }, trace: { actorUserId: this.actorUserId, authorization: decision.reason } };
        }
        const kindMap: Record<string,string> = {
          get_demand_forecast:'DEMAND_FORECAST',
          get_aging_risk:'AGING_RISK',
          get_recovery_priority:'RECOVERY_PRIORITY',
          get_stock_optimization:'STOCK_OPTIMIZATION',
          get_anomalies:'ANOMALY',
        };
        const kind = kindMap[call.tool];
        const params: unknown[] = [kind];
        const clauses = [`p.prediction_kind=$1`, `p.organization_id=${organizationIdSubquery()}`];
        const actorParam = params.push(this.actorUserId);
        if (!(context.roles.includes('CEO') || (context.roles.includes('ADMIN') && context.permissions.includes('ai.intelligence.manage')))) {
          const scopeParts = [`p.seller_user_id=$${actorParam}`];
          if (context.regionIds.length) { params.push(context.regionIds); scopeParts.push(`p.region_id=any($${params.length}::uuid[])`); }
          if (context.teamIds.length) { params.push(context.teamIds); scopeParts.push(`p.team_id=any($${params.length}::uuid[])`); }
          clauses.push(`(${scopeParts.join(' or ')})`);
        }
        params.push(limit);
        const data = await this.tx.query(
          `select p.model_key,p.model_version,p.prediction_kind,p.entity_type,p.entity_id,p.region_id,p.team_id,p.seller_user_id,p.product_variant_id,p.as_of_date,p.status,p.value,p.confidence,p.explanation,p.feature_schema_version,p.governance_version,p.updated_at
             from public.ml_predictions p
            where ${clauses.join(' and ')}
            order by p.as_of_date desc,p.updated_at desc
            limit $${params.length}`,
          params,
        );
        return { tool: call.tool, data: { mode:'SHADOW_READY', items:data }, trace: { actorUserId: this.actorUserId, authorization: decision.reason } };
      }

      case 'create_task': {
        requireAiExecute(context);
        asString(call.args,'taskType');
        nonNegativeInt(call.args,'priority',0);
        optionalString(call.args,'assignedTo');
        optionalString(call.args,'dueAt');
        optionalString(call.args,'resourceType');
        optionalString(call.args,'resourceId');
        optionalString(call.args,'notes');
        return { tool: call.tool, data: { status: 'PREPARED', requiresHumanApproval: true, arguments: call.args }, trace: { actorUserId: this.actorUserId, authorization: 'Governed Amaal AI action: preparation only' } };
      }

      case 'create_recovery_case': {
        requireAiExecute(context);
        validateCreateRecoveryArguments(call.args);
        const imeiId = asString(call.args,'imeiId');
        const rows = await this.tx.query<{current_holder_user_id:string|null;current_region_id:string|null;state:string}>(
          `select i.current_holder_user_id,i.current_region_id,i.state from public.imei_units i where i.id=$1 ${inventoryOrganizationClause('i')}`,
          [imeiId],
        );
        if (!rows.length) throw new ValidationError('Authorized IMEI was not found.');
        const device = rows[0]!;
        const deviceDecision = authorize(context,'inventory.view',{
          ...(device.current_holder_user_id?{ownerUserId:device.current_holder_user_id}:{}),
          ...(device.current_region_id?{regionId:device.current_region_id}:{}),
        });
        if (!deviceDecision.allowed) throw new AuthorizationError('Target IMEI is outside your authorized inventory scope.');
        const customerId = optionalString(call.args,'customerId');
        if (customerId) {
          const customerRows = await this.tx.query<{created_by:string;region_id:string|null;team_id:string|null}>(
            `select c.created_by,coalesce(ra.region_id,t.region_id) as region_id,coalesce(ra.team_id,tm.team_id) as team_id
             from public.customers c
             left join public.role_assignments ra on ra.user_id=c.created_by and ra.status='ACTIVE'
             left join public.team_memberships tm on tm.user_id=c.created_by and tm.status='ACTIVE'
             left join public.teams t on t.id=coalesce(ra.team_id,tm.team_id)
             where c.id=$1 and c.organization_id=${organizationIdSubquery()} limit 1`,
            [customerId],
          );
          if (!customerRows.length) throw new ValidationError('Authorized recovery customer was not found.');
          const customer=customerRows[0]!;
          const customerDecision=authorize(context,'customers.view',{ownerUserId:customer.created_by,...(customer.team_id?{teamId:customer.team_id}:{}),...(customer.region_id?{regionId:customer.region_id}: {})});
          if (!customerDecision.allowed) throw new AuthorizationError('Target customer is outside your authorized scope.');
        }
        return { tool: call.tool, data: { status: 'PREPARED', requiresHumanApproval: true, arguments: call.args, targetVerified: true }, trace: { actorUserId: this.actorUserId, authorization: 'Governed recovery preparation; normal recovery service required for mutation' } };
      }

      case 'prepare_transfer_request': {
        requireAiExecute(context);
        const imeiIds = call.args.imeiIds;
        if (!Array.isArray(imeiIds) || imeiIds.length<1 || imeiIds.length>100 || imeiIds.some((value)=>typeof value!=='string'||!value.trim())) throw new ValidationError('imeiIds must contain 1-100 valid IDs.');
        const targetKind = asString(call.args,'targetKind');
        const allowedTargets = new Set(['WAREHOUSE','MANAGER','TEAM','AGENT','SHOP']);
        if (!allowedTargets.has(targetKind)) throw new ValidationError('targetKind is invalid.');
        asString(call.args,'targetId');
        asString(call.args,'reason');
        return { tool: call.tool, data: { status: 'PREPARED', requiresHumanApproval: true, arguments: call.args, targetVerified: false, note:'Destination and custody checks run again in the normal inventory approval workflow.' }, trace: { actorUserId: this.actorUserId, authorization: 'Governed transfer preparation only' } };
      }

      case 'prepare_adjustment_request': {
        requireAiExecute(context);
        asString(call.args,'imeiId');
        asString(call.args,'targetState');
        asString(call.args,'reason');
        optionalString(call.args,'targetHolderUserId');
        optionalString(call.args,'targetWarehouseId');
        optionalString(call.args,'targetRegionId');
        optionalString(call.args,'targetTeamId');
        optionalString(call.args,'targetShopId');
        return { tool: call.tool, data: { status: 'PREPARED', requiresHumanApproval: true, arguments: call.args, targetVerified: false, note:'State and custody checks run again in the normal inventory approval workflow.' }, trace: { actorUserId: this.actorUserId, authorization: 'Governed adjustment preparation only' } };
      }

      case 'prepare_approval_request': {
        requireAiExecute(context);
        const requestedChanges = call.args.requestedChanges;
        if (!requestedChanges || typeof requestedChanges !== 'object' || Array.isArray(requestedChanges)) throw new ValidationError('requestedChanges must be an object.');
        asString(call.args,'approvalType');
        asString(call.args,'targetType');
        asString(call.args,'targetId');
        asString(call.args,'reason');
        return { tool: call.tool, data: { status: 'PREPARED', requiresHumanApproval: true, arguments: call.args }, trace: { actorUserId: this.actorUserId, authorization: 'Governed approval request preparation only; AI cannot approve' } };
      }
    }
  }
}
