from django_tenants.test.cases import TenantTestCase

from audit.models import AuditLog
from bookings.models import Room, RoomType


class AuditLogTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_audit'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-audit.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant Audit'
        tenant.created_by = 'test'

    def setUp(self):
        super().setUp()
        self.room_type = RoomType.objects.create(
            name='Audit Standard',
            code='AUD-STD',
            base_rate='100.00',
        )

    def test_create_update_and_delete_are_logged_for_business_models(self):
        room = Room.objects.create(
            room_number='701',
            room_type=self.room_type,
            capacity=2,
            price_per_night='100.00',
        )

        create_log = AuditLog.objects.filter(action='create', object_type='bookings.Room', object_id=str(room.id)).first()
        self.assertIsNotNone(create_log)
        self.assertEqual(create_log.module, 'bookings')

        room.status = 'maintenance'
        room.save(update_fields=['status', 'updated_at'])

        update_log = AuditLog.objects.filter(action='update', object_type='bookings.Room', object_id=str(room.id)).first()
        self.assertIsNotNone(update_log)
        self.assertEqual(update_log.changes['status']['before'], 'available')
        self.assertEqual(update_log.changes['status']['after'], 'maintenance')

        room_id = str(room.id)
        room.delete()

        self.assertTrue(AuditLog.objects.filter(action='delete', object_type='bookings.Room', object_id=room_id).exists())
