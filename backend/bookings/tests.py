from datetime import date

from rest_framework.test import APIClient
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import schema_context, tenant_context

from bookings.models import Booking, Guest, GuestCommunication, GuestFolio, GuestFolioLine, Room, RoomType
from bookings.services import extend_booking_stay, get_guest_history, transfer_booking_room
from housekeeping.models import HousekeepingTask
from housekeeping.services import complete_housekeeping_task, create_checkout_cleaning_task
from tenants.models import Domain, Tenant
from users.models import PlatformUser


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
        with schema_context('public'):
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


class CheckoutHousekeepingAutomationTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_housekeeping'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-housekeeping.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant Housekeeping'
        tenant.created_by = 'test'

    def setUp(self):
        super().setUp()
        suffix = self._testMethodName[-20:]
        self.room_type = RoomType.objects.create(
            name=f'Standard {suffix}',
            code=f'STD-{suffix}',
            base_rate='100.00',
        )
        self.room = Room.objects.create(
            room_number=f'1{abs(hash(suffix)) % 1000:03d}',
            room_type=self.room_type,
            capacity=2,
            price_per_night='100.00',
            status='occupied',
        )
        self.guest = Guest.objects.create(
            first_name='Test',
            last_name='Guest',
            email=f'guest-{suffix}@example.com',
        )
        self.booking = Booking.objects.create(
            room=self.room,
            guest=self.guest,
            check_in_date=date(2026, 5, 12),
            check_out_date=date(2026, 5, 13),
            number_of_guests=1,
            status='checked_in',
        )

    def test_checkout_creates_cleaning_task_and_sets_room_to_cleaning(self):
        task, created = create_checkout_cleaning_task(self.booking)

        self.assertTrue(created)
        self.assertEqual(task.task_type, 'checkout_clean')
        self.assertEqual(task.status, 'open')
        self.assertEqual(task.priority, 'normal')
        self.assertIn(str(self.booking.id), task.notes)

        self.room.refresh_from_db()
        self.assertEqual(self.room.status, 'cleaning')


class StayExtensionTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_extension'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-extension.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant Extension'
        tenant.created_by = 'test'

    def setUp(self):
        super().setUp()
        self.room_type = RoomType.objects.create(
            name='Extension Standard',
            code='EXT-STD',
            base_rate='100.00',
        )
        self.room = Room.objects.create(
            room_number='301',
            room_type=self.room_type,
            capacity=2,
            price_per_night='100.00',
            status='occupied',
        )
        self.guest = Guest.objects.create(
            first_name='Extend',
            last_name='Guest',
            email='extend.guest@example.com',
        )
        self.booking = Booking.objects.create(
            room=self.room,
            guest=self.guest,
            check_in_date=date(2026, 5, 10),
            check_out_date=date(2026, 5, 12),
            number_of_guests=1,
            status='checked_in',
        )

    def test_checked_in_booking_can_extend_stay_and_add_folio_charge(self):
        booking, folio = extend_booking_stay(self.booking, date(2026, 5, 14))

        booking.refresh_from_db()
        folio.refresh_from_db()

        self.assertEqual(booking.check_out_date, date(2026, 5, 14))
        self.assertEqual(booking.total_amount, 400)
        self.assertEqual(folio.subtotal, 200)
        self.assertEqual(folio.grand_total, 400)
        extension_line = GuestFolioLine.objects.get(folio=folio, source_module='booking_extension')
        self.assertEqual(extension_line.amount, 200)

    def test_extension_is_blocked_when_room_has_future_overlap(self):
        other_guest = Guest.objects.create(
            first_name='Future',
            last_name='Guest',
            email='future.guest@example.com',
        )
        Booking.objects.create(
            room=self.room,
            guest=other_guest,
            check_in_date=date(2026, 5, 13),
            check_out_date=date(2026, 5, 15),
            number_of_guests=1,
            status='confirmed',
        )

        with self.assertRaises(ValueError):
            extend_booking_stay(self.booking, date(2026, 5, 14))

        self.booking.refresh_from_db()
        self.assertEqual(self.booking.check_out_date, date(2026, 5, 12))
        self.assertFalse(GuestFolioLine.objects.filter(source_module='booking_extension').exists())

    def test_checked_in_booking_can_transfer_to_available_room(self):
        new_room = Room.objects.create(
            room_number='302',
            room_type=self.room_type,
            capacity=2,
            price_per_night='100.00',
            status='available',
        )

        booking, folio = transfer_booking_room(self.booking, new_room)

        booking.refresh_from_db()
        self.room.refresh_from_db()
        new_room.refresh_from_db()

        self.assertEqual(booking.room_id, new_room.id)
        self.assertEqual(booking.total_amount, 200)
        self.assertEqual(self.room.status, 'cleaning')
        self.assertEqual(new_room.status, 'occupied')
        self.assertEqual(folio.grand_total, 200)
        self.assertTrue(HousekeepingTask.objects.filter(room=self.room, task_type='stayover_clean', status='open').exists())
        self.assertTrue(GuestFolioLine.objects.filter(folio=folio, source_module='room_transfer', amount=0).exists())

    def test_room_transfer_is_blocked_when_target_room_has_overlap(self):
        new_room = Room.objects.create(
            room_number='303',
            room_type=self.room_type,
            capacity=2,
            price_per_night='100.00',
            status='available',
        )
        other_guest = Guest.objects.create(
            first_name='Move',
            last_name='Blocker',
            email='move.blocker@example.com',
        )
        Booking.objects.create(
            room=new_room,
            guest=other_guest,
            check_in_date=date(2026, 5, 11),
            check_out_date=date(2026, 5, 13),
            number_of_guests=1,
            status='confirmed',
        )

        with self.assertRaises(ValueError):
            transfer_booking_room(self.booking, new_room)

        self.booking.refresh_from_db()
        new_room.refresh_from_db()
        self.assertEqual(self.booking.room_id, self.room.id)
        self.assertEqual(new_room.status, 'available')

    def test_guest_history_summarizes_stays_and_folios(self):
        self.booking.status = 'checked_out'
        self.booking.save(update_fields=['status', 'updated_at'])
        folio = GuestFolio.objects.create(
            booking=self.booking,
            subtotal=self.booking.total_amount,
            status='paid',
            paid_amount=self.booking.total_amount,
        )

        history = get_guest_history(self.guest)

        self.assertEqual(history['summary']['total_bookings'], 1)
        self.assertEqual(history['summary']['completed_stays'], 1)
        self.assertEqual(history['summary']['active_bookings'], 0)
        self.assertEqual(history['summary']['lifetime_value'], folio.paid_amount)
        self.assertEqual(history['bookings'][0].id, self.booking.id)
        self.assertEqual(history['folios'][0].id, folio.id)

    def test_checkout_cleaning_task_is_idempotent_for_open_room_task(self):
        first_task, _ = create_checkout_cleaning_task(self.booking)
        second_task, created = create_checkout_cleaning_task(self.booking)

        self.assertFalse(created)
        self.assertEqual(second_task.id, first_task.id)
        self.assertEqual(HousekeepingTask.objects.filter(room=self.room, task_type='checkout_clean', status='open').count(), 1)

    def test_completing_last_housekeeping_task_sets_room_available(self):
        task, _ = create_checkout_cleaning_task(self.booking)

        complete_housekeeping_task(task)

        task.refresh_from_db()
        self.room.refresh_from_db()
        self.assertEqual(task.status, 'done')
        self.assertIsNotNone(task.completed_at)
        self.assertEqual(self.room.status, 'available')

    def test_completing_one_task_keeps_room_cleaning_when_another_task_is_active(self):
        task, _ = create_checkout_cleaning_task(self.booking)
        HousekeepingTask.objects.create(
            room=self.room,
            task_type='inspection',
            status='open',
            priority='normal',
        )

        complete_housekeeping_task(task)

        self.room.refresh_from_db()
        self.assertEqual(self.room.status, 'cleaning')


class GuestCommunicationApiTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_comms'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-comms.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant Communications'
        tenant.created_by = 'test'

    def setUp(self):
        super().setUp()
        self.client = APIClient(HTTP_HOST=self.get_test_tenant_domain())
        self.user = PlatformUser.objects.create_user(
            email='frontdesk-comms@example.com',
            password='testpass123456',
            tenant=self.tenant,
            is_tenant_admin=True,
        )
        self.client.force_authenticate(self.user)
        self.room_type = RoomType.objects.create(
            name='Comms Standard',
            code='COM-STD',
            base_rate='100.00',
        )
        self.room = Room.objects.create(
            room_number='601',
            room_type=self.room_type,
            capacity=2,
            price_per_night='100.00',
        )
        self.guest = Guest.objects.create(
            first_name='Care',
            last_name='Guest',
            email='care.guest@example.com',
        )
        self.booking = Booking.objects.create(
            room=self.room,
            guest=self.guest,
            check_in_date=date(2026, 5, 16),
            check_out_date=date(2026, 5, 18),
            number_of_guests=1,
            status='confirmed',
        )

    def test_tenant_user_can_log_guest_communication(self):
        response = self.client.post(
            '/api/v1/bookings/guest-communications/',
            {
                'guest': str(self.guest.id),
                'booking': str(self.booking.id),
                'channel': 'phone',
                'direction': 'outbound',
                'subject': 'Arrival preference',
                'message': 'Called guest to confirm late arrival and pillow preference.',
                'status': 'logged',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        communication = GuestCommunication.objects.get()
        self.assertEqual(communication.guest_id, self.guest.id)
        self.assertEqual(communication.booking_id, self.booking.id)
        self.assertEqual(communication.created_by_id, self.user.id)

    def test_guest_communications_can_be_filtered_by_guest(self):
        GuestCommunication.objects.create(
            guest=self.guest,
            booking=self.booking,
            channel='email',
            direction='inbound',
            subject='Dietary note',
            message='Guest requested vegetarian breakfast.',
            created_by=self.user,
        )
        other_guest = Guest.objects.create(
            first_name='Other',
            last_name='Guest',
            email='other.comms@example.com',
        )
        GuestCommunication.objects.create(
            guest=other_guest,
            channel='note',
            direction='internal',
            subject='Unrelated note',
            message='This should not be returned.',
            created_by=self.user,
        )

        response = self.client.get('/api/v1/bookings/guest-communications/', {'guest': str(self.guest.id)})

        self.assertEqual(response.status_code, 200)
        results = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['subject'], 'Dietary note')
