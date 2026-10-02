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
  subregionIds?: readonly string[];
  teamIds: readonly string[];
  shopIds: readonly string[];
}

export interface ResourceScope {
  ownerUserId?: string;
  regionId?: string;
  subregionId?: string;
  teamId?: string;
  shopId?: string;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason: string;
}

export function authorize(context: AuthorizationContext, permission: PermissionKey, resource: ResourceScope = {}): AuthorizationDecision {
  if (context.roles.includes('CEO')) return { allowed: true, reason: 'CEO company-wide authority' };
  if (!context.permissions.includes(permission)) return { allowed: false, reason: `Missing permission: ${permission}` };
  if (context.roles.includes('ADMIN')) return { allowed: true, reason: 'Admin permission within company scope' };

  if (resource.ownerUserId) {
    if (resource.ownerUserId === context.userId) return { allowed: true, reason: 'Resource is owned by requesting user' };
    // A narrower resource cannot fall back to a broader regional/team scope.
    if (!resource.shopId && !resource.teamId && !resource.subregionId && !resource.regionId) return { allowed: false, reason: 'Resource is owned by another user' };
  }

  if (resource.shopId) {
    return context.shopIds.includes(resource.shopId)
      ? { allowed: true, reason: 'Resource is inside user shop scope' }
      : { allowed: false, reason: 'Resource is outside organizational shop scope' };
  }
  if (resource.teamId) {
    if (context.roles.includes('AGENT') || context.roles.includes('SHOP_OWNER')) {
      return { allowed: false, reason: 'Seller roles cannot consume team-wide resources without seller/shop scope' };
    }
    return context.teamIds.includes(resource.teamId)
      ? { allowed: true, reason: 'Resource is inside user team scope' }
      : { allowed: false, reason: 'Resource is outside organizational team scope' };
  }
  if (resource.subregionId) {
    if (context.roles.includes('TEAM_LEADER') || context.roles.includes('AGENT') || context.roles.includes('SHOP_OWNER')) {
      return { allowed: false, reason: 'Seller roles cannot consume sub-region-wide resources without team scope' };
    }
    return context.subregionIds?.includes(resource.subregionId)
      ? { allowed: true, reason: 'Resource is inside user sub-region scope' }
      : { allowed: false, reason: 'Resource is outside organizational sub-region scope' };
  }
  if (resource.regionId) {
    if (context.roles.includes('MANAGER') || context.roles.includes('TEAM_LEADER') || context.roles.includes('AGENT') || context.roles.includes('SHOP_OWNER')) {
      return { allowed: false, reason: 'This role cannot consume region-wide resources' };
    }
    return context.regionIds.includes(resource.regionId)
      ? { allowed: true, reason: 'Resource is inside user region scope' }
      : { allowed: false, reason: 'Resource is outside organizational region scope' };
  }
  return { allowed: true, reason: 'Permission is sufficient and resource has no narrower scope' };
}
