from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import tenant_context

from bookings.models import Room, RoomType
from tenants.models import Domain, Tenant


class TenantRoomIsolationTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_a'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-a.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant A'
        tenant.created_by = 'test'

    def setUp(self):
        super().setUp()
        self.other_tenant = Tenant.objects.create(
            schema_name='tenant_b',
            name='Tenant B',
            created_by='test',
            on_trial=False,
        )
        Domain.objects.create(
            tenant=self.other_tenant,
            domain='tenant-b.test.com',
            is_primary=True,
        )

    def test_room_data_is_isolated_by_tenant_schema(self):
        with tenant_context(self.tenant):
            deluxe = RoomType.objects.create(
                name='Tenant A Deluxe',
                code='TA-DLX',
                base_rate='100.00',
            )
            Room.objects.create(
                room_number='101',
                room_type=deluxe,
                capacity=2,
                price_per_night='100.00',
            )

        with tenant_context(self.other_tenant):
            suite = RoomType.objects.create(
                name='Tenant B Suite',
                code='TB-SUI',
                base_rate='200.00',
            )
            Room.objects.create(
                room_number='201',
                room_type=suite,
                capacity=3,
                price_per_night='200.00',
            )

        with tenant_context(self.tenant):
            self.assertEqual(list(Room.objects.values_list('room_number', flat=True)), ['101'])

        with tenant_context(self.other_tenant):
            self.assertEqual(list(Room.objects.values_list('room_number', flat=True)), ['201'])
