import { createHash, randomBytes } from 'node:crypto';
import { AuthorizationError, ConflictError, ValidationError } from '@amaal/shared';
import type { ApiServices } from './index.ts';
import type { DatabaseTransaction } from '@amaal/database';
import { loadAuthorizationContext } from '@amaal/permissions';
import type { AuthorizationContext, RoleKey } from '@amaal/permissions';

const MANAGEABLE_ROLES = new Set<RoleKey>(['REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER','RECOVERY_OFFICER']);
const RECRUITABLE_ROLES = new Set<RoleKey>(['REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER','RECOVERY_OFFICER']);
const ADMIN_PROFILE_KEYS = new Set(['SYSTEM_ADMIN','USER_ADMIN','INVENTORY_ADMIN','FINANCE_ADMIN','REPORTING_ADMIN','OPERATIONS_ADMIN','AUDIT_ADMIN']);

export type OrganizationDirectoryRow = {
  userId: string; email: string | null; displayName: string; employeeNumber: string | null; phone: string | null;
  profileStatus: string; role: RoleKey; regionId: string | null; regionCode: string | null; regionName: string | null;
  subregionId: string | null; subregionCode: string | null; subregionName: string | null;
  managerUserId: string | null; managerName: string | null; teamId: string | null; teamCode: string | null; teamName: string | null;
  shopId: string | null; shopCode: string | null; shopName: string | null;
};

function requirePermission(context: AuthorizationContext, permission: string): void {
  if (context.roles.includes('CEO')) return;
  if (!context.permissions.includes(permission)) throw new AuthorizationError(`Missing permission: ${permission}`);
}

function canManageTarget(context: AuthorizationContext, role: RoleKey, regionId?: string, teamId?: string): void {
  if (!MANAGEABLE_ROLES.has(role)) throw new ValidationError('This role cannot be provisioned through the organizational control plane.');
  if (context.roles.includes('CEO')) {
    throw new AuthorizationError('CEO may create or invite Admins only; subordinate organizational roles are Admin-controlled.');
  }
  if (context.roles.includes('ADMIN')) {
    if (!['REGIONAL_MANAGER','MANAGER','TEAM_LEADER','AGENT','SHOP_OWNER'].includes(role)) {
      throw new AuthorizationError('Admins can recruit Regional Managers, Managers, Team Leaders, Agents and Shop Owners only.');
    }
    return;
  }
  if (context.roles.includes('REGIONAL_MANAGER')) {
    if (!['MANAGER','RECOVERY_OFFICER'].includes(role) || !regionId || !context.regionIds.includes(regionId)) {
      throw new AuthorizationError('Regional Managers can provision Managers or Recovery Officers only inside their assigned regions.');
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
  return services.transactions.withTransaction({ requestId: `org-context-${actorUserId}`, actorUserId }, (tx) => loadAuthorizationContext(tx, actorUserId));
}

export async function getOrganizationDirectory(services: ApiServices, actorUserId: string): Promise<OrganizationDirectoryRow[]> {
  const context = await actorContext(services, actorUserId);
  requirePermission(context, 'users.view');
  const params: unknown[] = [];
  let scope = '';
  if (context.roles.includes('CEO') || context.roles.includes('ADMIN')) {
    scope = 'and p.organization_id = (select organization_id from public.profiles where user_id = $1)';
    params.push(actorUserId);
  } else if (context.roles.includes('REGIONAL_MANAGER') || context.roles.includes('RECOVERY_OFFICER')) {
    params.push(context.regionIds as unknown as string[]);
    scope = context.regionIds.length ? 'and coalesce(ar.region_id, m.region_id, t.region_id) = any($1::uuid[])' : 'and false';
  } else if (context.roles.includes('MANAGER') || context.roles.includes('TEAM_LEADER')) {
    params.push(context.teamIds as unknown as string[]);
    scope = context.teamIds.length ? 'and coalesce(ar.team_id, am.team_id) = any($1::uuid[])' : 'and false';
  } else {
    scope = 'and p.user_id = $1';
    params.push(actorUserId);
  }

  return services.pool.query<OrganizationDirectoryRow>(`
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
      p.user_id as "userId", nu.email, p.display_name as "displayName", p.employee_number as "employeeNumber", p.phone,
      p.status as "profileStatus", ar.role,
      coalesce(ar.region_id,m.region_id,t.region_id) as "regionId",
      r.region_code as "regionCode", r.region_name as "regionName",
      coalesce(m.subregion_id,t.subregion_id) as "subregionId",
      sr.subregion_code as "subregionCode", sr.subregion_name as "subregionName",
      coalesce(ar.manager_user_id,t.manager_user_id) as "managerUserId", mp.display_name as "managerName",
      coalesce(ar.team_id,am.team_id) as "teamId", t.team_code as "teamCode", t.team_name as "teamName",
      coalesce(ar.shop_id,am.shop_id) as "shopId", s.shop_code as "shopCode", s.shop_name as "shopName"
    from public.profiles p
    join neon_auth."user" nu on nu.id=p.user_id
    left join active_role ar on ar.user_id=p.user_id
    left join active_membership am on am.user_id=p.user_id
    left join public.teams t on t.id=coalesce(ar.team_id,am.team_id)
    left join public.managers m on m.user_id=coalesce(ar.manager_user_id,t.manager_user_id)
    left join public.profiles mp on mp.user_id=m.user_id
    left join public.regions r on r.id=coalesce(ar.region_id,m.region_id,t.region_id)
    left join public.subregions sr on sr.id=coalesce(m.subregion_id,t.subregion_id)
    left join public.shops s on s.id=coalesce(ar.shop_id,am.shop_id)
    where p.status='ACTIVE' and ar.role is not null
    ${scope}
    order by r.region_name nulls last, sr.subregion_name nulls last, t.team_name nulls last, p.display_name
  `, params);
}

export type CreateRegionInput = { code: string; name: string; description?: string };
export async function createRegion(services: ApiServices, actorUserId: string, input: CreateRegionInput) {
  const context = await actorContext(services, actorUserId);
  if (!(context.roles.includes('CEO') || context.roles.includes('ADMIN'))) throw new AuthorizationError('Only CEO or Admin can create regions.');
  const organizationId = (await services.pool.query<{organization_id:string}>(`select organization_id from public.profiles where user_id=$1`, [actorUserId]))[0]?.organization_id;
  if (!organizationId) throw new ValidationError('Actor is not linked to an Amaal organization.');
  const code = input.code.trim().toUpperCase(); const name = input.name.trim();
  if (!code || !name) throw new ValidationError('Region code and name are required.');
  const existing = await services.pool.query(`select 1 from public.regions where organization_id=$1 and (region_code=$2 or lower(region_name)=lower($3)) limit 1`, [organizationId, code, name]);
  if (existing.length) throw new ConflictError('A region with the same code or name already exists.');
  return services.transactions.withTransaction({ requestId:`org-region-${Date.now()}`, actorUserId }, async (tx) => {
    const [region] = await tx.query<{id:string}>(`insert into public.regions(organization_id,region_code,region_name,description) values($1,$2,$3,$4) returning id`, [organizationId,code,name,input.description?.trim()||null]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'REGION_CREATED','REGION',$2,$3::jsonb,'Organization structure')`, [actorUserId,region.id,JSON.stringify({code,name})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('REGION_CREATED','REGION',$1,$2,$3::jsonb)`, [region.id,actorUserId,JSON.stringify({regionId:region.id,code,name})]);
    return region;
  });
}

export type CreateSubregionInput = { regionId: string; code: string; name: string; description?: string };
export async function createSubregion(services: ApiServices, actorUserId: string, input: CreateSubregionInput) {
  const context = await actorContext(services, actorUserId);
  if (!(context.roles.includes('CEO') || context.roles.includes('ADMIN'))) throw new AuthorizationError('Only CEO or Admin can create sub-regions.');
  const region = (await services.pool.query<{organization_id:string}>(`select organization_id from public.regions where id=$1 and status='ACTIVE'`, [input.regionId]))[0];
  if (!region) throw new ValidationError('Region is not active.');
  const code = input.code.trim().toUpperCase(); const name = input.name.trim();
  if (!code || !name) throw new ValidationError('Sub-region code and name are required.');
  return services.transactions.withTransaction({requestId:`org-subregion-${Date.now()}`,actorUserId}, async (tx) => {
    const [row] = await tx.query<{id:string}>(`insert into public.subregions(organization_id,region_id,subregion_code,subregion_name,description) values($1,$2,$3,$4,$5) returning id`, [region.organization_id,input.regionId,code,name,input.description?.trim()||null]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'SUBREGION_CREATED','SUBREGION',$2,$3::jsonb,'Organization structure')`, [actorUserId,row.id,JSON.stringify(input)]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,actor_user_id,payload) values('SUBREGION_CREATED','SUBREGION',$1,$2,$3,$4::jsonb)`, [row.id,input.regionId,actorUserId,JSON.stringify(input)]);
    return row;
  });
}

export type CreateTeamInput = { regionId: string; managerUserId: string; subregionId?: string; teamCode: string; teamName: string };
export async function createTeam(services: ApiServices, actorUserId: string, input: CreateTeamInput) {
  const context = await actorContext(services, actorUserId);
  if (!(context.roles.includes('CEO') || context.roles.includes('ADMIN') || context.roles.includes('MANAGER'))) throw new AuthorizationError('Only CEO, Admin or Manager can create teams.');
  if (context.roles.includes('MANAGER') && !context.roles.includes('CEO') && !context.roles.includes('ADMIN')) {
    if (input.managerUserId !== actorUserId || !context.regionIds.includes(input.regionId)) throw new AuthorizationError('Managers can create teams only for themselves inside their assigned region.');
  }
  const manager = (await services.pool.query<{region_id:string;subregion_id:string|null}>(`select region_id,subregion_id from public.managers where user_id=$1 and status='ACTIVE'`, [input.managerUserId]))[0];
  if (!manager || manager.region_id !== input.regionId) throw new ValidationError('Manager is not active in the selected region.');
  if (input.subregionId) {
    const sub = (await services.pool.query<{region_id:string}>(`select region_id from public.subregions where id=$1 and status='ACTIVE'`, [input.subregionId]))[0];
    if (!sub || sub.region_id !== input.regionId) throw new ValidationError('Sub-region is outside the selected region.');
  }
  return services.transactions.withTransaction({requestId:`org-team-${Date.now()}`,actorUserId}, async (tx) => {
    const [team] = await tx.query<{id:string}>(`insert into public.teams(region_id,manager_user_id,subregion_id,team_code,team_name) values($1,$2,$3,$4,$5) returning id`, [input.regionId,input.managerUserId,input.subregionId||null,input.teamCode.trim().toUpperCase(),input.teamName.trim()]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'TEAM_CREATED','TEAM',$2,$3::jsonb,'Organization structure')`, [actorUserId,team.id,JSON.stringify(input)]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,actor_user_id,payload) values('TEAM_CREATED','TEAM',$1,$2,$3,$4::jsonb)`, [team.id,input.regionId,actorUserId,JSON.stringify(input)]);
    return team;
  });
}

export type ProvisionPersonInput = {
  userId: string; displayName: string; employeeNumber?: string; phone?: string; role: RoleKey; regionId?: string;
  regionalManagerUserId?: string; subregionId?: string; managerUserId?: string; teamId?: string; shopId?: string;
};

async function applyProvisionedIdentityTx(
  tx: DatabaseTransaction,
  actorUserId: string,
  input: ProvisionPersonInput,
  auditReason: string,
) {
  const neonUser = (await tx.query<{id:string;email:string}>(`select id,email from neon_auth."user" where id=$1`, [input.userId]))[0];
  if (!neonUser) throw new ValidationError('The Neon Auth user does not exist.');
  if (input.role === 'MANAGER' && !input.regionId) throw new ValidationError('Manager requires regionId.');
  if (input.role === 'REGIONAL_MANAGER' && !input.regionId) throw new ValidationError('Regional Manager requires regionId.');
  if (input.role === 'RECOVERY_OFFICER' && !input.regionId) throw new ValidationError('Recovery Officer requires regionId.');
  if (['TEAM_LEADER','AGENT','SHOP_OWNER'].includes(input.role) && !input.teamId) throw new ValidationError(`${input.role} requires teamId.`);
  if (input.role === 'SHOP_OWNER' && !input.shopId) throw new ValidationError('Shop Owner requires shopId.');
  if (input.subregionId && !input.regionId) throw new ValidationError('subregionId requires regionId.');

  const org = (await tx.query<{organization_id:string}>(`select organization_id from public.profiles where user_id=$1`, [actorUserId]))[0];
  if (!org) throw new ValidationError('Actor is not linked to an Amaal organization.');

  const existing = await tx.query<{status:string}>(`select status from public.profiles where user_id=$1 for update`, [input.userId]);
  if (existing.length && existing[0].status === 'ACTIVE') throw new ConflictError('This identity is already provisioned in Amaal.');
  const activeRole = await tx.query(`select 1 from public.role_assignments where user_id=$1 and role=$2 and status='ACTIVE' and effective_to is null limit 1`, [input.userId, input.role]);
  if (activeRole.length) throw new ConflictError(`This identity already has an active ${input.role} assignment.`);

  if (input.regionId) {
    const region = (await tx.query<{organization_id:string}>(`select organization_id from public.regions where id=$1 and status='ACTIVE' for update`, [input.regionId]))[0];
    if (!region || region.organization_id !== org.organization_id) throw new ValidationError('Region is outside the Amaal organization.');
  }
  if (input.subregionId) {
    const sub = (await tx.query<{region_id:string}>(`select region_id from public.subregions where id=$1 and status='ACTIVE'`, [input.subregionId]))[0];
    if (!sub || sub.region_id !== input.regionId) throw new ValidationError('Sub-region is outside the selected region.');
  }
  if (input.regionalManagerUserId) {
    const rm = (await tx.query<{region_id:string}>(`select ra.region_id from public.role_assignments ra where ra.user_id=$1 and ra.role='REGIONAL_MANAGER' and ra.status='ACTIVE' and ra.effective_to is null`, [input.regionalManagerUserId]))[0];
    if (!rm || rm.region_id !== input.regionId) throw new ValidationError('Regional Manager is not active in the selected region.');
  }
  if (input.managerUserId && input.regionId) {
    const mgr = (await tx.query<{region_id:string}>(`select region_id from public.managers where user_id=$1 and status='ACTIVE'`, [input.managerUserId]))[0];
    if (!mgr || mgr.region_id !== input.regionId) throw new ValidationError('Manager is not active in the selected region.');
  }
  if (input.teamId) {
    const team = (await tx.query<{region_id:string;manager_user_id:string}>(`select region_id,manager_user_id from public.teams where id=$1 and status='ACTIVE'`, [input.teamId]))[0];
    if (!team || team.region_id !== input.regionId) throw new ValidationError('Team is outside the selected region.');
    if (input.role === 'TEAM_LEADER' && input.managerUserId && team.manager_user_id !== input.managerUserId) throw new ValidationError('Team Leader must belong to the selected Manager team.');
    if (input.role === 'TEAM_LEADER' && !input.managerUserId) input.managerUserId = team.manager_user_id;
  }
  if (input.shopId) {
    const shop = (await tx.query<{team_id:string}>(`select team_id from public.shops where id=$1 and status='ACTIVE'`, [input.shopId]))[0];
    if (!shop || shop.team_id !== input.teamId) throw new ValidationError('Shop is outside the selected team.');
  }

  await tx.query(`
    insert into public.profiles(user_id,organization_id,employee_number,display_name,phone,status)
    values($1,$2,$3,$4,$5,'ACTIVE')
    on conflict (user_id) do update set employee_number=excluded.employee_number,display_name=excluded.display_name,phone=excluded.phone,status='ACTIVE',updated_at=now()
  `, [input.userId,org.organization_id,input.employeeNumber?.trim()||null,input.displayName.trim(),input.phone?.trim()||null]);

  if (input.role === 'MANAGER') {
    let rmId = input.regionalManagerUserId ?? null;
    if (!rmId) {
      const regionalManagers = await tx.query<{user_id:string}>(`select user_id from public.role_assignments where role='REGIONAL_MANAGER' and region_id=$1 and status='ACTIVE' and effective_to is null order by effective_from desc`, [input.regionId]);
      if (regionalManagers.length === 0) throw new ValidationError('Manager requires an assigned Regional Manager.');
      if (regionalManagers.length > 1) throw new ValidationError("This region has multiple Regional Managers; select the Manager's Regional Manager explicitly.");
      rmId = regionalManagers[0].user_id;
    }
    await tx.query(`insert into public.managers(user_id,region_id,subregion_id,regional_manager_user_id) values($1,$2,$3,$4) on conflict (user_id) do update set region_id=excluded.region_id,subregion_id=excluded.subregion_id,regional_manager_user_id=excluded.regional_manager_user_id,status='ACTIVE',effective_to=null`, [input.userId,input.regionId,input.subregionId||null,rmId]);
  }

  const scope = input.role === 'REGIONAL_MANAGER'
    ? [input.regionId,null,null,null]
    : input.role === 'MANAGER'
      ? [null,input.userId,null,null]
      : input.role === 'RECOVERY_OFFICER'
        ? [input.regionId,null,null,null]
        : input.role === 'SHOP_OWNER'
          ? [null,null,input.teamId,input.shopId]
          : ['TEAM_LEADER','AGENT'].includes(input.role) ? [null,null,input.teamId,null] : [null,null,null,null];

  await tx.query(`
    insert into public.role_assignments(user_id,role,region_id,manager_user_id,team_id,shop_id,status)
    values($1,$2,$3,$4,$5,$6,'ACTIVE')
  `, [input.userId,input.role,...scope]);

  if (['TEAM_LEADER','AGENT','SHOP_OWNER'].includes(input.role)) {
    await tx.query(`insert into public.team_memberships(team_id,user_id,role,shop_id,status) values($1,$2,$3,$4,'ACTIVE')`, [input.teamId,input.userId,input.role,input.shopId||null]);
  }
  await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'IDENTITY_PROVISIONED','PROFILE',$2,$3::jsonb,$4)`, [actorUserId,input.userId,JSON.stringify(input),auditReason]);
  await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,team_id,actor_user_id,payload) values('IDENTITY_PROVISIONED','PROFILE',$1,$2,$3,$4,$5::jsonb)`, [input.userId,input.regionId||null,input.teamId||null,actorUserId,JSON.stringify({userId:input.userId,role:input.role,email:neonUser.email})]);
  return { userId: input.userId, email: neonUser.email, role: input.role };
}

async function applyProvisionedIdentity(services: ApiServices, actorUserId: string, input: ProvisionPersonInput, auditReason: string) {
  return services.transactions.withTransaction({requestId:`org-person-${Date.now()}`,actorUserId}, (tx) => applyProvisionedIdentityTx(tx, actorUserId, input, auditReason));
}

export async function provisionPerson(services: ApiServices, actorUserId: string, input: ProvisionPersonInput) {
  const context = await actorContext(services, actorUserId);
  requirePermission(context, 'users.create');
  canManageTarget(context, input.role, input.regionId, input.teamId);
  if (input.userId === actorUserId) throw new ValidationError('You cannot provision yourself through this endpoint.');
  return applyProvisionedIdentity(services, actorUserId, input, 'Phase 2B organization assignment');
}

export type ProvisionAdminInput = { userId: string; displayName: string; employeeNumber?: string; phone?: string; profileKey: string };

async function applyProvisionedAdminIdentityTx(
  tx: DatabaseTransaction,
  actorUserId: string,
  targetUserId: string,
  displayName: string,
  employeeNumber: string | undefined,
  profileKey: string | null,
  phone?: string,
  options: { allowSelf: boolean; auditReason: string } = { allowSelf: false, auditReason: 'CEO created an Admin identity' },
) {
  if (!profileKey || !ADMIN_PROFILE_KEYS.has(profileKey)) throw new ValidationError('Invalid Admin profile.');
  const org = (await tx.query<{organization_id:string}>(`select organization_id from public.profiles where user_id=$1`, [actorUserId]))[0];
  if (!org) throw new ValidationError('Actor is not linked to an Amaal organization.');
  const user = (await tx.query<{email:string}>(`select email from neon_auth."user" where id=$1`, [targetUserId]))[0];
  if (!user) throw new ValidationError('The Neon Auth user does not exist.');
  if (targetUserId === actorUserId && !options.allowSelf) throw new ValidationError('The CEO cannot provision themselves as Admin.');
  const existing = await tx.query<{status:string}>(`select status from public.profiles where user_id=$1 for update`, [targetUserId]);
  if (existing.length && existing[0].status === 'ACTIVE') throw new ConflictError('This identity is already provisioned in Amaal.');
  const activeAdmin = await tx.query(`select 1 from public.role_assignments where user_id=$1 and role='ADMIN' and status='ACTIVE' and effective_to is null limit 1`, [targetUserId]);
  if (activeAdmin.length) throw new ConflictError('This identity already has an active Admin assignment.');
  await tx.query(`insert into public.profiles(user_id,organization_id,employee_number,display_name,phone,status) values($1,$2,$3,$4,$5,'ACTIVE') on conflict (user_id) do update set employee_number=excluded.employee_number,display_name=excluded.display_name,phone=excluded.phone,status='ACTIVE',updated_at=now()`, [targetUserId,org.organization_id,employeeNumber?.trim()||null,displayName.trim(),phone?.trim()||null]);
  await tx.query(`insert into public.role_assignments(user_id,role,status) values($1,'ADMIN','ACTIVE')`, [targetUserId]);
  await tx.query(`insert into public.admin_profiles(user_id,profile_key,display_name,description,status) values($1,$2,$3,$4,'ACTIVE') on conflict (user_id) do update set profile_key=excluded.profile_key,display_name=excluded.display_name,description=excluded.description,status='ACTIVE',updated_at=now()`, [targetUserId,profileKey,profileKey.replaceAll('_',' '),'CEO-assigned administrative profile']);
  await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'ADMIN_PROVISIONED','PROFILE',$2,$3::jsonb,$4)`, [actorUserId,targetUserId,JSON.stringify({role:'ADMIN',profileKey,email:user.email}),options.auditReason]);
  await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,actor_user_id,payload) values('ADMIN_PROVISIONED','PROFILE',$1,$2,$3::jsonb)`, [targetUserId,actorUserId,JSON.stringify({userId:targetUserId,profileKey,email:user.email,auditReason:options.auditReason})]);
  return {userId:targetUserId,email:user.email,role:'ADMIN' as const,profileKey};
}

export async function provisionAdmin(services: ApiServices, actorUserId: string, input: ProvisionAdminInput) {
  const context = await actorContext(services, actorUserId);
  if (!context.roles.includes('CEO')) throw new AuthorizationError('Only the CEO can provision an Admin.');
  return services.transactions.withTransaction(
    {requestId:`org-admin-${Date.now()}`,actorUserId},
    (tx) => applyProvisionedAdminIdentityTx(tx, actorUserId, input.userId, input.displayName, input.employeeNumber, input.profileKey, input.phone),
  );
}

export type InvitationInput = Omit<ProvisionPersonInput,'userId'> & { email: string; expiresInHours?: number };
export type AdminInvitationInput = { email: string; displayName: string; employeeNumber?: string; phone?: string; profileKey: string; expiresInHours?: number };
function invitationHash(token: string): string { return createHash('sha256').update(token, 'utf8').digest('hex'); }

async function validateRecruitmentContext(services: ApiServices, actorUserId: string, input: Omit<InvitationInput,'email'|'expiresInHours'>) {
  const context = await actorContext(services, actorUserId);
  requirePermission(context, 'users.create');
  if (!RECRUITABLE_ROLES.has(input.role)) throw new ValidationError('Role cannot be invited through the recruitment workflow.');
  canManageTarget(context, input.role, input.regionId, input.teamId);
}

async function validateInvitationScopeTx(tx: DatabaseTransaction, input: InvitationInput): Promise<void> {
  if (['REGIONAL_MANAGER','RECOVERY_OFFICER','MANAGER'].includes(input.role) && !input.regionId) throw new ValidationError(`${input.role} requires regionId.`);
  if (['TEAM_LEADER','AGENT','SHOP_OWNER'].includes(input.role) && !input.teamId) throw new ValidationError(`${input.role} requires teamId.`);
  if (input.role === 'SHOP_OWNER' && !input.shopId) throw new ValidationError('Shop Owner requires shopId.');
  if (input.subregionId && !input.regionId) throw new ValidationError('subregionId requires regionId.');
  if (input.regionId) {
    const [region] = await tx.query<{organization_id:string}>(`select organization_id from public.regions where id=$1 and status='ACTIVE'`, [input.regionId]);
    if (!region) throw new ValidationError('Region is outside the active Amaal organization.');
  }
  if (input.subregionId) {
    const [sub] = await tx.query<{region_id:string}>(`select region_id from public.subregions where id=$1 and status='ACTIVE'`, [input.subregionId]);
    if (!sub || sub.region_id !== input.regionId) throw new ValidationError('Sub-region is outside the selected region.');
  }
  if (input.regionalManagerUserId) {
    if (!input.regionId) throw new ValidationError('regionalManagerUserId requires regionId.');
    const [rm] = await tx.query<{region_id:string}>(`select region_id from public.role_assignments where user_id=$1 and role='REGIONAL_MANAGER' and region_id=$2 and status='ACTIVE' and effective_to is null`, [input.regionalManagerUserId,input.regionId]);
    if (!rm) throw new ValidationError('Regional Manager is not active in the selected region.');
  }
  if (input.managerUserId) {
    if (!input.regionId) throw new ValidationError('managerUserId requires regionId.');
    const [manager] = await tx.query<{region_id:string}>(`select region_id from public.managers where user_id=$1 and region_id=$2 and status='ACTIVE'`, [input.managerUserId,input.regionId]);
    if (!manager) throw new ValidationError('Manager is not active in the selected region.');
  }
  if (input.role === 'MANAGER' && input.regionId && !input.regionalManagerUserId) {
    const regionalManagers = await tx.query<{user_id:string}>(`select user_id from public.role_assignments where role='REGIONAL_MANAGER' and region_id=$1 and status='ACTIVE' and effective_to is null`, [input.regionId]);
    if (regionalManagers.length === 0) throw new ValidationError('No active Regional Manager exists in the selected region.');
    if (regionalManagers.length > 1) throw new ValidationError("Select the Manager's Regional Manager explicitly because this region has multiple Regional Managers.");
  }
  if (input.teamId) {
    const [team] = await tx.query<{region_id:string;manager_user_id:string}>(`select region_id,manager_user_id from public.teams where id=$1 and status='ACTIVE'`, [input.teamId]);
    if (!team || team.region_id !== input.regionId) throw new ValidationError('Team is outside the selected region.');
    if (input.managerUserId && input.role === 'TEAM_LEADER' && team.manager_user_id !== input.managerUserId) throw new ValidationError('Team Leader must belong to the selected Manager team.');
  }
  if (input.shopId) {
    const [shop] = await tx.query<{team_id:string}>(`select team_id from public.shops where id=$1 and status='ACTIVE'`, [input.shopId]);
    if (!shop || shop.team_id !== input.teamId) throw new ValidationError('Shop is outside the selected team.');
  }
}

async function createInvitationRecord(tx: DatabaseTransaction, actorUserId: string, organizationId: string, input: InvitationInput | AdminInvitationInput, token: string, expiresHours: number, adminProfileKey?: string) {
  const isAdmin = 'profileKey' in input;
  const role = isAdmin ? 'ADMIN' : input.role;
  const [row] = await tx.query<{id:string;expires_at:string}>(
    `insert into public.identity_invitations(organization_id,email,role,display_name,employee_number,phone,region_id,subregion_id,regional_manager_user_id,manager_user_id,team_id,shop_id,admin_profile_key,token_hash,expires_at,invited_by_user_id)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now()+make_interval(hours => $15),$16) returning id,expires_at`,
    [organizationId,input.email.trim().toLowerCase(),role,input.displayName.trim(),input.employeeNumber?.trim()||null,input.phone?.trim()||null,isAdmin?null:input.regionId||null,isAdmin?null:input.subregionId||null,isAdmin?null:input.regionalManagerUserId||null,isAdmin?null:input.managerUserId||null,isAdmin?null:input.teamId||null,isAdmin?null:input.shopId||null,isAdmin?input.profileKey:null,invitationHash(token),expiresHours,actorUserId],
  );
  await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'IDENTITY_INVITATION_CREATED','IDENTITY_INVITATION',$2,$3::jsonb,'Controlled recruitment invitation')`, [actorUserId,row.id,JSON.stringify({email:input.email.trim().toLowerCase(),role,adminProfileKey:isAdmin?input.profileKey:null})]);
  await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,team_id,actor_user_id,payload) values('IDENTITY_INVITATION_CREATED','IDENTITY_INVITATION',$1,$2,$3,$4,$5::jsonb)`, [row.id,isAdmin?null:input.regionId||null,isAdmin?null:input.teamId||null,actorUserId,JSON.stringify({email:input.email.trim().toLowerCase(),role,expiresAt:row.expires_at})]);
  return row;
}

export async function createOrganizationInvitation(services: ApiServices, actorUserId: string, input: InvitationInput) {
  await validateRecruitmentContext(services, actorUserId, input);
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ValidationError('A valid invitation email is required.');
  const token = randomBytes(32).toString('base64url');
  const expiresHours = Math.min(Math.max(Number(input.expiresInHours ?? 72), 1), 168);
  return services.transactions.withTransaction({requestId:`org-invite-${Date.now()}`,actorUserId}, async (tx) => {
    const existingUser = await tx.query(`select 1 from neon_auth."user" where lower(email)=lower($1) limit 1`, [email]);
    if (existingUser.length) throw new ConflictError('A Neon Auth account already exists for this email.');
    const organizationId = (await tx.query<{organization_id:string}>(`select organization_id from public.profiles where user_id=$1`, [actorUserId]))[0]?.organization_id;
    if (!organizationId) throw new ValidationError('Actor is not linked to an Amaal organization.');
    await validateInvitationScopeTx(tx, input);
    const row = await createInvitationRecord(tx, actorUserId, organizationId, input, token, expiresHours);
    const origin = (process.env.AMAAL_WEB_ORIGIN?.split(',')[0]?.trim() || 'https://amaal-erp.vercel.app').replace(/\/$/,'');
    return { invitationId: row.id, email, role: input.role, expiresAt: row.expires_at, token, inviteUrl: `${origin}/signup?invite=${encodeURIComponent(token)}` };
  });
}

export async function createAdminInvitation(services: ApiServices, actorUserId: string, input: AdminInvitationInput) {
  const context = await actorContext(services, actorUserId);
  requirePermission(context, 'users.create');
  if (!context.roles.includes('CEO')) throw new AuthorizationError('Only the CEO can invite an Admin.');
  const email = input.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ValidationError('A valid invitation email is required.');
  if (!ADMIN_PROFILE_KEYS.has(input.profileKey)) throw new ValidationError('Invalid Admin profile.');
  const token = randomBytes(32).toString('base64url');
  const expiresHours = Math.min(Math.max(Number(input.expiresInHours ?? 72), 1), 168);
  return services.transactions.withTransaction({requestId:`org-admin-invite-${Date.now()}`,actorUserId}, async (tx) => {
    const existingUser = await tx.query(`select 1 from neon_auth."user" where lower(email)=lower($1) limit 1`, [email]);
    if (existingUser.length) throw new ConflictError('A Neon Auth account already exists for this email.');
    const organizationId = (await tx.query<{organization_id:string}>(`select organization_id from public.profiles where user_id=$1`, [actorUserId]))[0]?.organization_id;
    if (!organizationId) throw new ValidationError('Actor is not linked to an Amaal organization.');
    const row = await createInvitationRecord(tx, actorUserId, organizationId, input, token, expiresHours, input.profileKey);
    const origin = (process.env.AMAAL_WEB_ORIGIN?.split(',')[0]?.trim() || 'https://amaal-erp.vercel.app').replace(/\/$/,'');
    return { invitationId: row.id, email, role:'ADMIN' as const, profileKey:input.profileKey, expiresAt:row.expires_at, token, inviteUrl:`${origin}/signup?invite=${encodeURIComponent(token)}` };
  });
}

export async function getOrganizationInvitationPreview(services: ApiServices, token: string) {
  const [row] = await services.pool.query<{email:string;display_name:string;role:RoleKey;expires_at:string}>(`select email,display_name,role,expires_at from public.identity_invitations where token_hash=$1 and status='PENDING' and expires_at>now() limit 1`, [invitationHash(token.trim())]);
  if (!row) throw new ConflictError('Invitation is invalid, expired or already used.');
  return { email: row.email, displayName: row.display_name, role: row.role, expiresAt: row.expires_at };
}

export async function acceptOrganizationInvitation(services: ApiServices, actorUserId: string, authenticatedEmail: string | null, token: string) {
  const email = authenticatedEmail?.trim().toLowerCase();
  if (!email) throw new ValidationError('Authenticated email is required to accept an invitation.');
  return services.transactions.withTransaction({requestId:`org-invite-accept-${Date.now()}`,actorUserId}, async (tx) => {
    const [inv] = await tx.query<{
      id:string; email:string; role:RoleKey; display_name:string; employee_number:string|null; phone:string|null;
      admin_profile_key:string|null; region_id:string|null; subregion_id:string|null; regional_manager_user_id:string|null;
      manager_user_id:string|null; team_id:string|null; shop_id:string|null;
    }>(`select * from public.identity_invitations where token_hash=$1 and status='PENDING' and expires_at > now() for update`, [invitationHash(token.trim())]);
    if (!inv) throw new ConflictError('Invitation is invalid, expired or already used.');
    if (String(inv.email).toLowerCase() !== email) throw new AuthorizationError('This invitation was issued for a different email address.');
    const result = inv.role === 'ADMIN'
      ? await applyProvisionedAdminIdentityTx(tx, actorUserId, actorUserId, inv.display_name, inv.employee_number ?? undefined, inv.admin_profile_key, inv.phone ?? undefined, { allowSelf: true, auditReason: 'Accepted CEO-issued Admin invitation' })
      : await applyProvisionedIdentityTx(tx, actorUserId, {userId:actorUserId, displayName:inv.display_name, employeeNumber:inv.employee_number ?? undefined, phone:inv.phone ?? undefined, role:inv.role, regionId:inv.region_id ?? undefined, subregionId:inv.subregion_id ?? undefined, regionalManagerUserId:inv.regional_manager_user_id ?? undefined, managerUserId:inv.manager_user_id ?? undefined, teamId:inv.team_id ?? undefined, shopId:inv.shop_id ?? undefined }, 'Invitation accepted');
    await tx.query(`update public.identity_invitations set status='ACCEPTED',accepted_at=now(),accepted_user_id=$2 where id=$1`, [inv.id,actorUserId]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'IDENTITY_INVITATION_ACCEPTED','IDENTITY_INVITATION',$2,$3::jsonb,'Recruitment invitation accepted')`, [actorUserId,inv.id,JSON.stringify({userId:actorUserId,role:inv.role,email,adminProfileKey:inv.admin_profile_key})]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,region_id,team_id,actor_user_id,payload) values('IDENTITY_INVITATION_ACCEPTED','IDENTITY_INVITATION',$1,$2,$3,$4,$5::jsonb)`, [inv.id,inv.region_id||null,inv.team_id||null,actorUserId,JSON.stringify({userId:actorUserId,role:inv.role,email})]);
    return { ...result, invitationId: inv.id, status: 'ACCEPTED' as const };
  });
}

export type CreateShopInput = { teamId: string; shopCode: string; shopName: string; location?: string };
export async function createShop(services: ApiServices, actorUserId: string, input: CreateShopInput) {
  const context = await actorContext(services, actorUserId);
  requirePermission(context, 'users.create');
  if (!context.roles.includes('CEO') && !context.roles.includes('ADMIN') && !context.teamIds.includes(input.teamId)) throw new AuthorizationError('Shop is outside your organizational scope.');
  const organizationId = (await services.pool.query<{organization_id:string}>(`select organization_id from public.profiles where user_id=$1`, [actorUserId]))[0]?.organization_id;
  if (!organizationId) throw new ValidationError('Actor is not linked to an Amaal organization.');
  return services.transactions.withTransaction({requestId:`org-shop-${Date.now()}`,actorUserId}, async (tx) => {
    const team = (await tx.query<{organization_id:string}>(`select r.organization_id from public.teams t join public.regions r on r.id=t.region_id where t.id=$1 and t.status='ACTIVE'`, [input.teamId]))[0];
    if (!team || team.organization_id !== organizationId) throw new ValidationError('Team is outside the organization.');
    const [shop] = await tx.query<{id:string}>(`insert into public.shops(organization_id,team_id,shop_code,shop_name,location) values($1,$2,$3,$4,$5) returning id`, [organizationId,input.teamId,input.shopCode.trim().toUpperCase(),input.shopName.trim(),input.location?.trim()||null]);
    await tx.query(`insert into public.audit_events(actor_user_id,action,target_type,target_id,new_state,reason) values($1,'SHOP_CREATED','SHOP',$2,$3::jsonb,'Organization structure')`, [actorUserId,shop.id,JSON.stringify(input)]);
    await tx.query(`insert into public.outbox_events(event_type,aggregate_type,aggregate_id,team_id,actor_user_id,payload) values('SHOP_CREATED','SHOP',$1,$2,$3,$4::jsonb)`, [shop.id,input.teamId,actorUserId,JSON.stringify(input)]);
    return shop;
  });
}
