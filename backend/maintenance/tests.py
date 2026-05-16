from django_tenants.test.cases import TenantTestCase

from bookings.models import Room, RoomType
from housekeeping.models import HousekeepingTask
from maintenance.models import MaintenanceTicket
from maintenance.services import cancel_maintenance_ticket, create_maintenance_ticket, resolve_maintenance_ticket, start_maintenance_ticket


class MaintenanceTicketTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_maintenance'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-maintenance.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant Maintenance'
        tenant.created_by = 'test'

    def setUp(self):
        super().setUp()
        self.room_type = RoomType.objects.create(
            name='Maintenance Standard',
            code='MNT-STD',
            base_rate='100.00',
        )
        self.room = Room.objects.create(
            room_number='501',
            room_type=self.room_type,
            capacity=2,
            price_per_night='100.00',
            status='available',
        )

    def test_creating_ticket_sets_room_to_maintenance(self):
        ticket = create_maintenance_ticket(
            room=self.room,
            title='Leaking sink',
            category='plumbing',
            priority='high',
        )

        self.room.refresh_from_db()
        self.assertEqual(ticket.status, 'open')
        self.assertEqual(self.room.status, 'maintenance')

    def test_resolving_last_active_ticket_releases_room(self):
        ticket = create_maintenance_ticket(room=self.room, title='AC repair')
        start_maintenance_ticket(ticket)

        resolve_maintenance_ticket(ticket, 'Filter replaced')

        ticket.refresh_from_db()
        self.room.refresh_from_db()
        self.assertEqual(ticket.status, 'resolved')
        self.assertIsNotNone(ticket.started_at)
        self.assertIsNotNone(ticket.resolved_at)
        self.assertEqual(ticket.resolution_notes, 'Filter replaced')
        self.assertEqual(self.room.status, 'available')

    def test_resolving_one_ticket_keeps_room_in_maintenance_when_another_is_active(self):
        first = create_maintenance_ticket(room=self.room, title='Window latch')
        create_maintenance_ticket(room=self.room, title='Door lock')

        resolve_maintenance_ticket(first)

        self.room.refresh_from_db()
        self.assertEqual(self.room.status, 'maintenance')

    def test_resolving_ticket_returns_room_to_cleaning_when_housekeeping_is_active(self):
        ticket = create_maintenance_ticket(room=self.room, title='Paint touch up')
        HousekeepingTask.objects.create(room=self.room, task_type='deep_clean', status='open')

        resolve_maintenance_ticket(ticket)

        self.room.refresh_from_db()
        self.assertEqual(self.room.status, 'cleaning')

    def test_cancel_ticket_releases_room_when_no_other_active_work_exists(self):
        ticket = create_maintenance_ticket(room=self.room, title='Loose handle')

        cancel_maintenance_ticket(ticket)

        ticket.refresh_from_db()
        self.room.refresh_from_db()
        self.assertEqual(ticket.status, 'canceled')
        self.assertEqual(self.room.status, 'available')

    def test_ticket_queryset_exposes_created_ticket(self):
        create_maintenance_ticket(room=self.room, title='Smoke detector')

        self.assertEqual(MaintenanceTicket.objects.filter(room=self.room).count(), 1)
