export function isPrivilegedRole(roles: string[]): boolean {
  return roles.includes('CEO') || roles.includes('ADMIN');
}
