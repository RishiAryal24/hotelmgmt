from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DefaultUserAdmin

from users.models import PlatformUser, Permission, Role


@admin.register(PlatformUser)
class PlatformUserAdmin(DefaultUserAdmin):
    list_display = ('email', 'full_name', 'tenant', 'is_active', 'is_staff', 'is_platform_admin', 'is_tenant_admin')
    list_filter = ('is_staff', 'is_active', 'is_platform_admin', 'is_tenant_admin')
    search_fields = ('email', 'full_name')
    ordering = ('email',)
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Personal info', {'fields': ('full_name', 'tenant')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_platform_admin', 'is_tenant_admin', 'is_superuser', 'roles')}),
        ('Important dates', {'fields': ('last_login',)}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'full_name', 'password1', 'password2', 'is_platform_admin', 'is_tenant_admin', 'roles'),
        }),
    )


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'tenant', 'is_system')
    list_filter = ('is_system',)
    search_fields = ('name', 'code')


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'module')
    list_filter = ('module',)
    search_fields = ('name', 'code')
