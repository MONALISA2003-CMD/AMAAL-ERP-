import type { AuthorizationContext, PermissionKey, RoleKey } from './authorization.ts';
import type { DatabaseTransaction } from '@amaal/database';

export async function loadAuthorizationContext(
  tx: DatabaseTransaction,
  userId: string,
): Promise<AuthorizationContext> {
  const roles = await tx.query<{ role: RoleKey }>(
    `select role from public.role_assignments where user_id=$1 and status='ACTIVE' and (effective_to is null or effective_to > now())`,
    [userId],
  );
  const roleKeys = roles.map((row) => row.role);

  // CEO is company-wide. Do not make the CEO bootstrap depend on the
  // narrower region/team/shop graph used by operational roles.
  if (roleKeys.includes('CEO')) {
    const permissions = await tx.query<{ permission_key: PermissionKey }>(
      `select distinct permission_key from public.role_permissions where role='CEO'`,
      [],
    );
    return {
      userId,
      roles: roleKeys,
      permissions: permissions.map((row) => row.permission_key),
      regionIds: [],
      subregionIds: [],
      teamIds: [],
      shopIds: [],
    };
  }

  const [rolePermissions, adminProfile, adminProfilePermissions, regions, directSubregions, directTeams] = await Promise.all([
    tx.query<{ permission_key: PermissionKey }>(
      `select distinct rp.permission_key
       from public.role_assignments ra
       join public.role_permissions rp on rp.role=ra.role
       where ra.user_id=$1 and ra.status='ACTIVE' and (ra.effective_to is null or ra.effective_to > now())`,
      [userId],
    ),
    tx.query<{ profile_key: string }>(
      `select profile_key from public.admin_profiles where user_id=$1 and status='ACTIVE'`,
      [userId],
    ),
    tx.query<{ permission_key: PermissionKey }>(
      `select distinct app.permission_key
       from public.admin_profiles ap
       join public.admin_profile_permissions app on app.profile_key=ap.profile_key
       where ap.user_id=$1 and ap.status='ACTIVE'`,
      [userId],
    ),
    tx.query<{ region_id: string }>(
      `select distinct x.region_id from (
        select region_id
        from public.role_assignments
        where user_id=$1 and region_id is not null and status='ACTIVE'
        union
        select m.region_id
        from public.managers m
        where m.user_id=$1 and m.region_id is not null and m.status='ACTIVE'
        union
        select t.region_id
        from public.teams t
        join public.team_memberships tm on tm.team_id=t.id
        where tm.user_id=$1 and tm.status='ACTIVE' and (tm.effective_to is null or tm.effective_to > now())
      ) x`,
      [userId],
    ),
    tx.query<{ subregion_id: string }>(
      `select distinct x.subregion_id from (
        select m.subregion_id
        from public.managers m
        where m.user_id=$1 and m.subregion_id is not null and m.status='ACTIVE'
        union
        select t.subregion_id
        from public.teams t
        join public.team_memberships tm on tm.team_id=t.id
        where tm.user_id=$1 and tm.status='ACTIVE' and (tm.effective_to is null or tm.effective_to > now()) and t.subregion_id is not null
      ) x`,
      [userId],
    ),
    tx.query<{ team_id: string }>(
      `select distinct x.team_id from (
        select team_id
        from public.role_assignments
        where user_id=$1 and team_id is not null and status='ACTIVE'
        union
        select team_id
        from public.team_memberships
        where user_id=$1 and status='ACTIVE' and (effective_to is null or effective_to > now())
        union
        select id
        from public.teams
        where manager_user_id=$1 and status='ACTIVE'
      ) x`,
      [userId],
    ),
  ]);

  const regionIds = regions.map((row) => row.region_id);
  let effectiveSubregions = directSubregions.map((row) => row.subregion_id);
  let effectiveTeams = directTeams.map((row) => row.team_id);

  // Regional operational roles inherit everything in their assigned regions.
  if ((roleKeys.includes('REGIONAL_MANAGER') || roleKeys.includes('RECOVERY_OFFICER')) && regionIds.length) {
    effectiveSubregions = (await tx.query<{ id: string }>(
      `select id from public.subregions where status='ACTIVE' and region_id = any($1::uuid[])`,
      [regionIds],
    )).map((row) => row.id);
    effectiveTeams = (await tx.query<{ id: string }>(
      `select id from public.teams where status='ACTIVE' and region_id = any($1::uuid[])`,
      [regionIds],
    )).map((row) => row.id);
  }

  let effectiveShops = (await tx.query<{ shop_id: string }>(
    `select distinct x.shop_id from (
      select shop_id
      from public.role_assignments
      where user_id=$1 and shop_id is not null and status='ACTIVE'
      union
      select shop_id
      from public.team_memberships
      where user_id=$1 and shop_id is not null and status='ACTIVE' and (effective_to is null or effective_to > now())
    ) x`,
    [userId],
  )).map((row) => row.shop_id);

  if (effectiveTeams.length) {
    effectiveShops = (await tx.query<{ id: string }>(
      `select id from public.shops where status='ACTIVE' and team_id = any($1::uuid[])`,
      [effectiveTeams],
    )).map((row) => row.id);
  }

  const permissions = roleKeys.includes('ADMIN')
    ? (adminProfile.length > 0 ? adminProfilePermissions.map((row) => row.permission_key) : [])
    : rolePermissions.map((row) => row.permission_key);

  return {
    userId,
    roles: roleKeys,
    permissions,
    regionIds,
    subregionIds: [...new Set(effectiveSubregions)],
    teamIds: [...new Set(effectiveTeams)],
    shopIds: [...new Set(effectiveShops)],
  };
}
