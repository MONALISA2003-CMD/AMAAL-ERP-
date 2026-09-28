import type { DatabaseTransaction } from '@amaal/database';
import { AuthorizationError, ValidationError } from '@amaal/shared';
import { authorize, loadAuthorizationContext, type AuthorizationContext } from '@amaal/permissions';

export type JarvisReadTool =
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
  | 'generate_report';

export type JarvisActionTool =
  | 'create_task'
  | 'create_recovery_case'
  | 'prepare_transfer_request'
  | 'prepare_adjustment_request'
  | 'prepare_approval_request';

export type JarvisToolName = JarvisReadTool | JarvisActionTool;

export type JarvisToolCall = {
  tool: JarvisToolName;
  args: Record<string, unknown>;
};

export type JarvisToolResult = {
  tool: JarvisToolName;
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

function requireAiApprove(context: AuthorizationContext): void {
  const decision = authorize(context, 'ai.approve');
  if (!decision.allowed) throw new AuthorizationError(decision.reason);
}

function asString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError(`${key} is required.`);
  return value.trim();
}

function limitArg(args: Record<string, unknown>): number {
  const raw = Number(args.limit ?? 50);
  if (!Number.isFinite(raw)) throw new ValidationError('limit must be a number.');
  return Math.min(Math.max(Math.trunc(raw), 1), 200);
}

function isCompanyWide(context: AuthorizationContext): boolean {
  return context.roles.includes('CEO') || context.roles.includes('ADMIN');
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
          and tm_scope.status = 'ACTIVE'
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
  if (requestedUserId) {
    if (context.roles.includes('CEO')) return { clause: 'where c.beneficiary_user_id = $1', params: [requestedUserId], authorization: 'CEO company-wide commission scope' };
    if (context.roles.includes('ADMIN')) return { clause: 'where c.beneficiary_user_id = $1', params: [requestedUserId], authorization: 'Admin commission scope' };
    if (context.roles.includes('REGIONAL_MANAGER') && context.regionIds.length) {
      return {
        clause: `where c.beneficiary_user_id = $1 and exists (
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
        clause: `where c.beneficiary_user_id = $1 and exists (
          select 1 from public.team_memberships tm_scope
          where tm_scope.user_id = c.beneficiary_user_id
            and tm_scope.team_id = any($2::uuid[])
            and tm_scope.status='ACTIVE'
        )`,
        params: [requestedUserId, context.teamIds],
        authorization: 'Team commission scope',
      };
    }
    return { clause: 'where c.beneficiary_user_id = $1', params: [actorUserId], authorization: 'Commission target restricted to actor' };
  }
  return { clause: 'where c.beneficiary_user_id = $1', params: [actorUserId], authorization: 'Own commission scope' };
}

export class JarvisToolGateway {
  constructor(private readonly tx: DatabaseTransaction, private readonly actorUserId: string) {}

  private async context(): Promise<AuthorizationContext> {
    const context = await loadAuthorizationContext(this.tx, this.actorUserId);
    requireAiUse(context);
    return context;
  }

  async call(call: JarvisToolCall): Promise<JarvisToolResult> {
    const context = await this.context();

    switch (call.tool) {
      case 'get_my_stock': {
        const decision = authorize(context, 'inventory.view', { ownerUserId: this.actorUserId });
        if (!decision.allowed) throw new AuthorizationError(decision.reason);
        const data = await this.tx.query(
          `select id,imei,state,current_region_id,current_warehouse_id,field_age_started_at,current_holder_started_at,aging_due_at,condition_status
           from public.imei_units where current_holder_user_id=$1 order by updated_at desc`, [this.actorUserId],
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
           order by i.updated_at desc`, [teamId],
        );
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization: decision.reason } };
      }

      case 'get_region_stock': {
        const regionId = asString(call.args, 'regionId');
        const decision = authorize(context, 'inventory.view', { regionId });
        if (!decision.allowed) throw new AuthorizationError(decision.reason);
        const data = await this.tx.query(
          `select id,imei,state,current_holder_user_id,current_region_id,current_warehouse_id,field_age_started_at,aging_due_at,condition_status
           from public.imei_units where current_region_id=$1 order by updated_at desc`, [regionId],
        );
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization: decision.reason } };
      }

      case 'find_imei': {
        const imei = asString(call.args, 'imei');
        const rows = await this.tx.query<{ id:string; state:string; current_holder_user_id:string|null; current_region_id:string|null; current_warehouse_id:string|null }>(
          `select id,state,current_holder_user_id,current_region_id,current_warehouse_id from public.imei_units where imei=$1`, [imei],
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
          `select current_holder_user_id,current_region_id,state from public.imei_units where id=$1`, [imeiId],
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
             where si.imei_id=$1 order by s.completed_at desc nulls last limit 1`, [imeiId],
          );
          const sale = sellerRows[0];
          if (sale) decision = authorize(context, 'sales.view', { ownerUserId: sale.seller_user_id, ...(sale.team_id ? { teamId: sale.team_id } : {}), ...(sale.region_id ? { regionId: sale.region_id } : {}) });
        }
        if (!decision.allowed) throw new AuthorizationError(decision.reason);
        const data = await this.tx.query(
          `select id,imei_id,from_holder_user_id,to_holder_user_id,from_warehouse_id,to_warehouse_id,movement_type,reason,requested_by,approved_by,accepted_by,requested_at,approved_at,accepted_at,condition_before,condition_after,approval_id,recovery_case_id,allocation_id,created_at
           from public.inventory_movements where imei_id=$1 order by created_at asc`, [imeiId],
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
           where 1=1 ${scope.clause}
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
           from public.commissions c ${scope.clause} order by c.created_at desc limit 200`, scope.params,
        );
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization: scope.authorization } };
      }

      case 'get_aging': {
        const scope = inventoryScope(context, this.actorUserId);
        const data = await this.tx.query(
          `select i.id,i.imei,i.state,i.current_holder_user_id,i.current_region_id,i.current_warehouse_id,i.field_age_started_at,i.current_holder_started_at,i.aging_due_at
           from public.imei_units i where i.state not in ('SOLD') ${scope.clause}
           order by i.aging_due_at asc nulls last limit 200`, scope.params,
        );
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization: scope.authorization } };
      }

      case 'get_recovery_queue': {
        const scope = recoveryScope(context, this.actorUserId);
        const data = await this.tx.query(
          `select rc.id,rc.case_number,rc.imei_id,rc.customer_id,rc.assigned_officer_user_id,rc.status,rc.priority,rc.due_at,rc.opened_at
           from public.recovery_cases rc ${scope.join}
           where rc.status not in ('CLOSED','CANCELLED') ${scope.clause}
           order by rc.priority desc,rc.due_at asc nulls last`, scope.params,
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
           where c.id=$1 limit 1`, [customerId],
        );
        if (!rows.length) throw new ValidationError('Customer not found.');
        const row = rows[0]!;
        const decision = authorize(context, 'customers.view', { ownerUserId: row.created_by, ...(row.team_id ? { teamId: row.team_id } : {}), ...(row.region_id ? { regionId: row.region_id } : {}) });
        if (!decision.allowed) throw new AuthorizationError(decision.reason);
        const data = await this.tx.query(`select id,customer_number,full_name,phone,alternative_phone,email,address,customer_type,consent_status,status,created_at,updated_at from public.customers where id=$1`, [customerId]);
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
           where s.status='COMPLETED' ${scope.clause}
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
          data = await this.tx.query(`select count(*)::bigint as sales_count,coalesce(sum(s.total_amount),0)::numeric as revenue from public.sales s where s.status='COMPLETED' ${scope.clause}`, scope.params);
          authorization = scope.authorization;
        } else if (report === 'inventory_summary') {
          const scope = inventoryScope(context, this.actorUserId);
          data = await this.tx.query(`select i.state,count(*)::bigint as units from public.imei_units i where 1=1 ${scope.clause} group by i.state order by i.state`, scope.params);
          authorization = scope.authorization;
        } else if (report === 'recovery_summary') {
          const scope = recoveryScope(context, this.actorUserId);
          data = await this.tx.query(`select rc.status,count(*)::bigint as cases from public.recovery_cases rc ${scope.join} where 1=1 ${scope.clause} group by rc.status order by rc.status`, scope.params);
          authorization = scope.authorization;
        } else {
          const scope = commissionScope(context, this.actorUserId);
          data = await this.tx.query(`select c.beneficiary_user_id,coalesce(sum(c.amount),0)::numeric as commission from public.commissions c ${scope.clause} group by c.beneficiary_user_id order by commission desc`, scope.params);
          authorization = scope.authorization;
        }
        return { tool: call.tool, data, trace: { actorUserId: this.actorUserId, authorization } };
      }

      case 'create_task':
      case 'create_recovery_case':
      case 'prepare_transfer_request':
      case 'prepare_adjustment_request':
      case 'prepare_approval_request': {
        requireAiExecute(context);
        if (call.tool === 'prepare_adjustment_request' || call.tool === 'prepare_transfer_request' || call.tool === 'prepare_approval_request') requireAiApprove(context);
        return { tool: call.tool, data: { status: 'PREPARED', requiresHumanApproval: true, arguments: call.args }, trace: { actorUserId: this.actorUserId, authorization: 'Governed Jarvis action: preparation only' } };
      }
    }
  }
}
