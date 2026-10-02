import { AuthorizationError, ConflictError, ValidationError } from '@amaal/shared';
import type { ApiServices } from './index.ts';
import { loadAuthorizationContext } from '@amaal/permissions';
import type { AuthorizationContext, RoleKey } from '@amaal/permissions';

const MANAGEABLE_ROLES = new Set<RoleKey>(['REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER']);

export type OrganizationDirectoryRow = {
  userId: string;
  email: string | null;
  displayName: string;
  employeeNumber: string | null;
  phone: string | null;
  profileStatus: string;
  role: RoleKey;
  regionId: string | null;
  regionCode: string | null;
  regionName: string | null;
  managerUserId: string | null;
  managerName: string | null;
  teamId: string | null;
  teamCode: string | null;
  teamName: string | null;
  shopId: string | null;
  shopCode: string | null;
  shopName: string | null;
};

function requirePermission(context: AuthorizationContext, permission: string): void {
  if (context.roles.includes('CEO')) return;
  if (!context.permissions.includes(permission)) throw new AuthorizationError(`Missing permission: ${permission}`);
}

function canManageTarget(context: AuthorizationContext, role: RoleKey, regionId?: string, teamId?: string): void {
  if (!MANAGEABLE_ROLES.has(role)) throw new ValidationError('This role cannot be provisioned through the organizational control plane.');
  if (context.roles.includes('CEO') || context.roles.includes('ADMIN')) return;

  if (context.roles.includes('REGIONAL_MANAGER')) {
    if (role !== 'MANAGER' || !regionId || !context.regionIds.includes(regionId)) {
      throw new AuthorizationError('Regional Managers can provision Managers only inside their assigned regions.');
    }
    return;
  }

  if (context.roles.includes('MANAGER')) {
    if (role !== 'TEAM_LEADER' || !teamId || !context.teamIds.includes(teamId)) {
      throw new AuthorizationError('Managers can provision Team Leaders only inside their own teams.');
    }
    return;
  }

  if (context.roles.includes('TEAM_LEADER')) {
    if (!['AGENT','SHOP_OWNER'].includes(role) || !teamId || !context.teamIds.includes(teamId)) {
      throw new AuthorizationError('Team Leaders can provision Agents or Shop Owners only inside their own team.');
    }
    return;
  }

  throw new AuthorizationError('This role cannot manage organizational identities.');
}

async function actorContext(services: ApiServices, actorUserId: string) {
  return services.transactions.withTransaction({ requestId: `org-context-${actorUserId}`, actorUserId }, tx => loadAuthorizationContext(tx, actorUserId));
}

export async function getOrganizationDirectory(services: ApiServices, actorUserId: string): Promise<OrganizationDirectoryRow[]> {
  const context = await actorContext(services, actorUserId);
  requirePermission(context, 'users.view');

  const params: unknown[] = [];
  let scope = '';
  if (context.roles.includes('CEO') || context.roles.includes('ADMIN')) {
    scope = `and p.organization_id = (select organization_id from public.profiles where user_id = $1)`;
    params.push(actorUserId);
  } else if (context.roles.includes('REGIONAL_MANAGER')) {
    params.push(context.regionIds as unknown as string[]);
    scope = context.regionIds.length ? `and coalesce(ar.region_id, m.region_id, t.region_id) = any($1::uuid[])` : `and false`;
  } else if (context.roles.includes('MANAGER') || context.roles.includes('TEAM_LEADER')) {
    params.push(context.teamIds as unknown as string[]);
    scope = context.teamIds.length ? `and coalesce(ar.team_id, am.team_id) = any($1::uuid[])` : `and false`;
  } else {
    scope = `and p.user_id = $1`;
    params.push(actorUserId);
  }

  const rows = await services.pool.query<OrganizationDirectoryRow>(`
    with active_role as (
      select distinct on (ra.user_id)
        ra.user_id, ra.role, ra.region_id, ra.manager_user_id, ra.team_id, ra.shop_id
      from public.role_assignments ra
      where ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to > now())
      order by ra.user_id, ra.effective_from desc
    ), active_membership as (
      select distinct on (tm.user_id)
        tm.user_id, tm.team_id, tm.shop_id, tm.role
      from public.team_memberships tm
      where tm.status='ACTIVE' and (tm.effective_to is null or tm.effective_to > now())
      order by tm.user_id, tm.effective_from desc
    )
    select
      p.user_id as "userId",
      nu.email as email,
      p.display_name as "displayName",
      p.employee_number as "employeeNumber",
      p.phone,
      p.status as "profileStatus",
      ar.role,
      coalesce(ar.region_id,m.region_id,t.region_id) as "regionId",
      r.region_code as "regionCode",
      r.region_name as "regionName",
      coalesce(ar.manager_user_id,t.manager_user_id) as "managerUserId",
      mp.display_name as "managerName",
      coalesce(ar.team_id, am.team_id) as "teamId",
      t.team_code as "teamCode",
      t.team_name as "teamName",
      coalesce(ar.shop_id, am.shop_id) as "shopId",
      s.shop_code as "shopCode",
      s.shop_name as "shopName"
    from public.profiles p
    join neon_auth."user" nu on nu.id=p.user_id
    left join active_role ar on ar.user_id=p.user_id
    left join active_membership am on am.user_id=p.user_id
    left join public.teams t on t.id=coalesce(ar.team_id,am.team_id)
    left join public.managers m on m.user_id=coalesce(ar.manager_user_id,t.manager_user_id)
    left join public.profiles mp on mp.user_id=m.user_id
    left join public.regions r on r.id=coalesce(ar.region_id,m.region_id,t.region_id)
    left join public.shops s on s.id=coalesce(ar.shop_id,am.shop_id)
    where p.status='ACTIVE' and ar.role is not null
    ${scope}
    order by r.region_name nulls last, t.team_name nulls last, p.display_name
  `, params);
  return rows;
}

export type CreateRegionInput = { code: string; name: string; description?: string };
export async function createRegion(services: ApiServices, actorUserId: string, input: CreateRegionInput) {
  const context = await actorContext(services, actorUserId);
  if (!(context.roles.includes('CEO') || context.roles.includes('ADMIN'))) throw new AuthorizationError('Only CEO or Admin can create regions.');
  const organizationId = (await services.pool.query<{organization_id:string}>(`select organization_id from public.profiles where user_id=$1`, [actorUserId]))[0]?.organization_id;
  if (!organizationId) throw new ValidationError('Actor is not linked to an Amaal organization.');
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code || !name) throw new ValidationError('Region code and name are required.');
  const existing = await services.pool.query(`select 1 from public.regions where organization_id=$1 and (region_code=$2 or region_name=$3) limit 1`, [organizationId, code, name]);
  if (existing.length) throw new ConflictError('A region with the same code or name already exists.');
  return services.transactions.withTransaction({requestId:`org-region-${Date.now()}`,actorUserId}, async tx => {
    const [region] = await tx.query<{id:string}>(`insert into public.regions(organization_id,region_code,region_name,description) values($1,$2,$3,$4) returning id`, [organizationId,code,name,input.description?.trim()||null]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'REGION_CREATED','REGION',$2,$3::jsonb,'Organization structure')`, [actorUserId,region.id,JSON.stringify({code,name})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('REGION_CREATED','REGION',$1,$2,$3::jsonb)`, [region.id,actorUserId,JSON.stringify({regionId:region.id,code,name})]);
    return region;
  });
}

export type CreateTeamInput = { regionId: string; managerUserId: string; teamCode: string; teamName: string };
export async function createTeam(services: ApiServices, actorUserId: string, input: CreateTeamInput) {
  const context = await actorContext(services, actorUserId);
  if (!(context.roles.includes('CEO') || context.roles.includes('ADMIN') || context.roles.includes('MANAGER'))) throw new AuthorizationError('Only CEO, Admin or Manager can create teams.');
  if (context.roles.includes('MANAGER') && !context.roles.includes('CEO') && !context.roles.includes('ADMIN')) {
    if (input.managerUserId !== actorUserId || !context.regionIds.includes(input.regionId)) throw new AuthorizationError('Managers can create teams only for themselves inside their assigned region.');
  }
  const manager = (await services.pool.query<{region_id:string}>(`select region_id from public.managers where user_id=$1 and status='ACTIVE'`, [input.managerUserId]))[0];
  if (!manager || manager.region_id !== input.regionId) throw new ValidationError('Manager is not active in the selected region.');
  return services.transactions.withTransaction({requestId:`org-team-${Date.now()}`,actorUserId}, async tx => {
    const [team] = await tx.query<{id:string}>(`insert into public.teams(region_id,manager_user_id,team_code,team_name) values($1,$2,$3,$4) returning id`, [input.regionId,input.managerUserId,input.teamCode.trim().toUpperCase(),input.teamName.trim()]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'TEAM_CREATED','TEAM',$2,$3::jsonb,'Organization structure')`, [actorUserId,team.id,JSON.stringify(input)]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,actor_user_id,payload) values('TEAM_CREATED','TEAM',$1,$2,$3,$4::jsonb)`, [team.id,input.regionId,actorUserId,JSON.stringify(input)]);
    return team;
  });
}

export type ProvisionPersonInput = {
  userId: string;
  displayName: string;
  employeeNumber?: string;
  phone?: string;
  role: RoleKey;
  regionId?: string;
  managerUserId?: string;
  teamId?: string;
  shopId?: string;
};

export async function provisionPerson(services: ApiServices, actorUserId: string, input: ProvisionPersonInput) {
  const context = await actorContext(services, actorUserId);
  requirePermission(context, 'users.create');
  canManageTarget(context, input.role, input.regionId, input.teamId);
  if (input.userId === actorUserId && input.role !== 'CEO') throw new ValidationError('You cannot provision yourself into a second organizational role through this endpoint.');
  const neonUser = (await services.pool.query<{id:string;email:string}>(`select id,email from neon_auth."user" where id=$1`, [input.userId]))[0];
  if (!neonUser) throw new ValidationError('The Neon Auth user does not exist.');
  if (input.role === 'MANAGER' && !input.regionId) throw new ValidationError('Manager requires regionId.');
  if (input.role === 'REGIONAL_MANAGER' && !input.regionId) throw new ValidationError('Regional Manager requires regionId.');
  if (['TEAM_LEADER','AGENT','SHOP_OWNER'].includes(input.role) && !input.teamId) throw new ValidationError(`${input.role} requires teamId.`);
  if (input.role === 'SHOP_OWNER' && !input.shopId) throw new ValidationError('Shop Owner requires shopId.');

  return services.transactions.withTransaction({requestId:`org-person-${Date.now()}`,actorUserId}, async tx => {
    const existing = await tx.query<{status:string}>(`select status from public.profiles where user_id=$1`, [input.userId]);
    if (existing.length && existing[0].status === 'ACTIVE') throw new ConflictError('This identity is already provisioned in Amaal.');
    await tx.query(`insert into public.profiles(user_id,organization_id,employee_number,display_name,phone,status)
      values($1,(select organization_id from public.profiles where user_id=$2),$3,$4,$5,'ACTIVE')
      on conflict (user_id) do update set employee_number=excluded.employee_number,display_name=excluded.display_name,phone=excluded.phone,status='ACTIVE',updated_at=now()`,
      [input.userId,actorUserId,input.employeeNumber?.trim()||null,input.displayName.trim(),input.phone?.trim()||null]);

    if (input.role === 'MANAGER') {
      await tx.query(`insert into public.managers(user_id,region_id) values($1,$2) on conflict (user_id) do update set region_id=excluded.region_id,status='ACTIVE',effective_to=null`, [input.userId,input.regionId]);
    }
    const scope = input.role === 'REGIONAL_MANAGER'
      ? [input.regionId,null,null,null]
      : input.role === 'MANAGER'
        ? [null,input.userId,null,null]
        : input.role === 'SHOP_OWNER'
          ? [null,null,input.teamId,input.shopId]
          : ['TEAM_LEADER','AGENT'].includes(input.role) ? [null,null,input.teamId,null] : [null,null,null,null];
    await tx.query(`insert into public.role_assignments(user_id,role,region_id,manager_user_id,team_id,shop_id,status)
      values($1,$2,$3,$4,$5,$6,'ACTIVE')`, [input.userId,input.role,...scope]);

    if (['TEAM_LEADER','AGENT','SHOP_OWNER'].includes(input.role)) {
      await tx.query(`insert into public.team_memberships(team_id,user_id,role,shop_id,status)
        values($1,$2,$3,$4,'ACTIVE')`, [input.teamId,input.userId,input.role,input.shopId||null]);
    }

    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'IDENTITY_PROVISIONED','PROFILE',$2,$3::jsonb,'Phase 2B organization assignment')`, [actorUserId,input.userId,JSON.stringify(input)]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,team_id,actor_user_id,payload) values('IDENTITY_PROVISIONED','PROFILE',$1,$2,$3,$4,$5::jsonb)`, [input.userId,input.regionId||null,input.teamId||null,actorUserId,JSON.stringify({userId:input.userId,role:input.role,email:neonUser.email})]);
    return { userId: input.userId, email: neonUser.email, role: input.role };
  });
}

export type CreateShopInput = { teamId: string; shopCode: string; shopName: string; location?: string };
export async function createShop(services: ApiServices, actorUserId: string, input: CreateShopInput) {
  const context = await actorContext(services, actorUserId);
  requirePermission(context, 'users.create');
  if (!context.roles.includes('CEO') && !context.roles.includes('ADMIN') && !context.teamIds.includes(input.teamId)) throw new AuthorizationError('Shop is outside your organizational scope.');
  const organizationId = (await services.pool.query<{organization_id:string}>(`select organization_id from public.profiles where user_id=$1`, [actorUserId]))[0]?.organization_id;
  if (!organizationId) throw new ValidationError('Actor is not linked to an Amaal organization.');
  return services.transactions.withTransaction({requestId:`org-shop-${Date.now()}`,actorUserId}, async tx => {
    const [shop] = await tx.query<{id:string}>(`insert into public.shops(organization_id,team_id,shop_code,shop_name,location) values($1,$2,$3,$4,$5) returning id`, [organizationId,input.teamId,input.shopCode.trim().toUpperCase(),input.shopName.trim(),input.location?.trim()||null]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'SHOP_CREATED','SHOP',$2,$3::jsonb,'Organization structure')`, [actorUserId,shop.id,JSON.stringify(input)]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,team_id,actor_user_id,payload) values('SHOP_CREATED','SHOP',$1,$2,$3,$4::jsonb)`, [shop.id,input.teamId,actorUserId,JSON.stringify(input)]);
    return shop;
  });
}
