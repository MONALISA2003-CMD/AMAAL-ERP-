import type { AuthorizationContext, PermissionKey, RoleKey, ResourceScope, AuthorizationDecision } from './authorization.ts';
import type { DatabaseTransaction } from '@amaal/database';

export async function loadAuthorizationContext(
  tx: DatabaseTransaction,
  userId: string,
): Promise<AuthorizationContext> {
  const [roles, permissions, regions, teams, shops] = await Promise.all([
    tx.query<{ role: RoleKey }>(
      `select role from public.role_assignments where user_id = $1 and status = 'ACTIVE' and (effective_to is null or effective_to > now())`,
      [userId],
    ),
    tx.query<{ permission_key: PermissionKey }>(
      `select distinct rp.permission_key
       from public.role_assignments ra
       join public.role_permissions rp on rp.role = ra.role
       where ra.user_id = $1 and ra.status = 'ACTIVE' and (ra.effective_to is null or ra.effective_to > now())`,
      [userId],
    ),
    tx.query<{ region_id: string }>(
      `select distinct x.region_id
       from (
         select region_id from public.role_assignments where user_id=$1 and region_id is not null and status='ACTIVE'
         union
         select m.region_id from public.managers m where m.user_id=$1 and m.status='ACTIVE'
         union
         select t.region_id from public.team_memberships tm join public.teams t on t.id=tm.team_id where tm.user_id=$1 and tm.status='ACTIVE' and (tm.effective_to is null or tm.effective_to > now())
       ) x`,
      [userId],
    ),
    tx.query<{ team_id: string }>(
      `select distinct x.team_id
       from (
         select team_id from public.role_assignments where user_id = $1 and team_id is not null and status='ACTIVE'
         union
         select team_id from public.team_memberships where user_id = $1 and status='ACTIVE' and (effective_to is null or effective_to > now())
         union
         select id from public.teams where manager_user_id=$1 and status='ACTIVE'
       ) x`,
      [userId],
    ),
    tx.query<{ shop_id: string }>(
      `select distinct shop_id from public.role_assignments where user_id = $1 and shop_id is not null and status='ACTIVE'
       union
       select distinct shop_id from public.team_memberships where user_id = $1 and shop_id is not null and status='ACTIVE' and (effective_to is null or effective_to > now())`,
      [userId],
    ),
  ]);

  return {
    userId,
    roles: roles.map((row) => row.role),
    permissions: permissions.map((row) => row.permission_key),
    regionIds: regions.map((row) => row.region_id),
    teamIds: teams.map((row) => row.team_id),
    shopIds: shops.map((row) => row.shop_id),
  };
}

export function authorizeRequest(
  context: AuthorizationContext,
  permission: PermissionKey,
  resource: ResourceScope = {},
): AuthorizationDecision {
  return authorize(context, permission, resource);
}

import { authorize } from './authorization.ts';
