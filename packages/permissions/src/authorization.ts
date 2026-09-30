export type RoleKey =
  | 'CEO'
  | 'ADMIN'
  | 'REGIONAL_MANAGER'
  | 'MANAGER'
  | 'TEAM_LEADER'
  | 'AGENT'
  | 'SHOP_OWNER'
  | 'RECOVERY_OFFICER';

export type PermissionKey = string;

export interface AuthorizationContext {
  userId: string;
  roles: readonly RoleKey[];
  permissions: readonly PermissionKey[];
  regionIds: readonly string[];
  teamIds: readonly string[];
  shopIds: readonly string[];
}

export interface ResourceScope {
  ownerUserId?: string;
  regionId?: string;
  teamId?: string;
  shopId?: string;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason: string;
}

export function authorize(
  context: AuthorizationContext,
  permission: PermissionKey,
  resource: ResourceScope = {},
): AuthorizationDecision {
  if (context.roles.includes('CEO')) {
    return { allowed: true, reason: 'CEO company-wide authority' };
  }

  if (!context.permissions.includes(permission)) {
    return { allowed: false, reason: `Missing permission: ${permission}` };
  }

  if (resource.ownerUserId && resource.ownerUserId === context.userId) {
    return { allowed: true, reason: 'Resource is owned by requesting user' };
  }

  if (resource.shopId && context.shopIds.includes(resource.shopId)) {
    return { allowed: true, reason: 'Resource is inside user shop scope' };
  }

  if (resource.teamId && context.teamIds.includes(resource.teamId)) {
    return { allowed: true, reason: 'Resource is inside user team scope' };
  }

  if (resource.regionId && context.regionIds.includes(resource.regionId)) {
    return { allowed: true, reason: 'Resource is inside user region scope' };
  }

  if (!resource.ownerUserId && !resource.regionId && !resource.teamId && !resource.shopId) {
    return { allowed: true, reason: 'Permission is sufficient and resource has no narrower scope' };
  }

  return { allowed: false, reason: 'Resource is outside organizational scope' };
}
