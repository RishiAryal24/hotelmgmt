from django.test import TestCase

from users.models import Permission, PlatformUser, Role
from users.permissions import user_has_any_permission, user_has_permission


class UserPermissionTests(TestCase):
    def setUp(self):
        self.permission = Permission.objects.create(
            code='bookings.reservation.read',
            name='View reservations',
            module='bookings',
        )
        self.role = Role.objects.create(name='Receptionist', code='receptionist')
        self.role.permissions.add(self.permission)

    def test_staff_user_has_permission_through_role(self):
        user = PlatformUser.objects.create_user(email='frontdesk@example.com', password='testpass123456')
        user.roles.add(self.role)

        self.assertTrue(user_has_permission(user, 'bookings.reservation.read'))
        self.assertTrue(user_has_any_permission(user, ['pos.sale.create', 'bookings.reservation.read']))

    def test_staff_user_without_permission_is_denied(self):
        user = PlatformUser.objects.create_user(email='waiter@example.com', password='testpass123456')

        self.assertFalse(user_has_permission(user, 'bookings.reservation.read'))

    def test_platform_admin_bypasses_role_permissions(self):
        user = PlatformUser.objects.create_user(
            email='admin@example.com',
            password='testpass123456',
            is_platform_admin=True,
        )

        self.assertTrue(user_has_permission(user, 'accounting.journal.create'))

    def test_tenant_admin_bypasses_role_permissions(self):
        user = PlatformUser.objects.create_user(
            email='tenant-admin@example.com',
            password='testpass123456',
            is_tenant_admin=True,
        )

        self.assertTrue(user_has_permission(user, 'rooms.room.update'))

    def test_staff_without_roles_gets_admin_fallback(self):
        user = PlatformUser.objects.create_user(
            email='staff-admin@example.com',
            password='testpass123456',
            is_staff=True,
        )

        self.assertTrue(user_has_permission(user, 'rooms.room.update'))
