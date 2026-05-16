import { AuthUser } from './auth';

export const userPermissionCodes = (user?: AuthUser) => {
  if (!user) return new Set<string>();
  return new Set(user.roles.flatMap((role) => role.permissions.map((permission) => permission.code)));
};

export const hasAdminAccessFallback = (user?: AuthUser) => {
  if (!user) return false;
  if (user.is_platform_admin || user.is_tenant_admin) return true;
  return user.is_staff && user.roles.length === 0;
};

export const canAccess = (user: AuthUser | undefined, permissions: string | string[]) => {
  if (!user) return false;
  if (hasAdminAccessFallback(user)) return true;

  const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
  const permissionCodes = userPermissionCodes(user);
  return requiredPermissions.some((permission) => permissionCodes.has(permission));
};

export const canAccessAny = (user: AuthUser | undefined, permissions: string[]) => canAccess(user, permissions);
