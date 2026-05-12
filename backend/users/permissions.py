from rest_framework.permissions import BasePermission


def user_has_permission(user, permission_code: str) -> bool:
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_platform_admin', False) or getattr(user, 'is_tenant_admin', False):
        return True
    return user.roles.filter(permissions__code=permission_code).exists()


def user_has_any_permission(user, permission_codes) -> bool:
    if isinstance(permission_codes, str):
        permission_codes = [permission_codes]
    if not user or not user.is_authenticated:
        return False
    if getattr(user, 'is_platform_admin', False) or getattr(user, 'is_tenant_admin', False):
        return True
    return user.roles.filter(permissions__code__in=permission_codes).exists()


class IsPlatformAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'is_platform_admin', False))


class IsTenantAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'is_tenant_admin', False))


class HasActionPermission(BasePermission):
    """
    Check a DRF view/action against a view-defined permission map.

    Viewsets can define `permission_map = {'list': 'rooms.room.read', ...}`.
    Platform admins and tenant admins are allowed through; staff users need a
    role containing the mapped permission code.
    """

    default_action_map = {
        'list': 'read',
        'retrieve': 'read',
        'create': 'create',
        'update': 'update',
        'partial_update': 'update',
        'destroy': 'delete',
    }

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if getattr(user, 'is_platform_admin', False) or getattr(user, 'is_tenant_admin', False):
            return True

        permission_map = getattr(view, 'permission_map', {})
        action = getattr(view, 'action', None)
        permission_code = permission_map.get(action)

        if not permission_code:
            method = request.method.lower()
            permission_code = permission_map.get(method)

        if not permission_code:
            permission_code = getattr(view, 'required_permission', None)

        if not permission_code:
            return False

        return user_has_any_permission(user, permission_code)
