from datetime import date
from unittest.mock import patch

from django.test import override_settings
from kombu.exceptions import OperationalError
from rest_framework.test import APIClient
from django_tenants.test.cases import TenantTestCase
from django_tenants.utils import schema_context, tenant_context

from bookings.models import Booking, FacilityAmenity, FacilityService, Guest, GuestCommunication, GuestFolio, GuestFolioLine, Room, RoomType
from bookings.services import check_in_booking, create_walk_in_booking, extend_booking_stay, get_guest_history, modify_confirmed_booking, transfer_booking_room
from bookings.tasks import queue_booking_confirmation_email
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


class BookingModificationTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_modification'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-modification.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant Modification'
        tenant.created_by = 'test'

    def setUp(self):
        super().setUp()
        self.client = APIClient(HTTP_HOST=self.get_test_tenant_domain())
        self.user = PlatformUser.objects.create_user(
            email='frontdesk-modification@example.com',
            password='testpass123456',
            tenant=self.tenant,
            is_tenant_admin=True,
        )
        self.client.force_authenticate(self.user)
        self.room_type = RoomType.objects.create(
            name='Modification Standard',
            code='MOD-STD',
            base_rate='100.00',
        )
        self.room = Room.objects.create(
            room_number='801',
            room_type=self.room_type,
            capacity=2,
            price_per_night='100.00',
        )
        self.new_room = Room.objects.create(
            room_number='802',
            room_type=self.room_type,
            capacity=3,
            price_per_night='120.00',
        )
        self.guest = Guest.objects.create(
            first_name='Modify',
            last_name='Guest',
            email='modify.guest@example.com',
        )
        self.booking = Booking.objects.create(
            room=self.room,
            guest=self.guest,
            check_in_date=date(2026, 5, 20),
            check_out_date=date(2026, 5, 22),
            number_of_guests=1,
            status='confirmed',
            special_requests='Quiet room',
        )

    def test_confirmed_booking_can_be_modified_and_repriced(self):
        booking = modify_confirmed_booking(
            self.booking,
            room=self.new_room,
            check_in_date=date(2026, 5, 21),
            check_out_date=date(2026, 5, 24),
            number_of_guests=2,
            special_requests='Twin beds',
        )

        booking.refresh_from_db()

        self.assertEqual(booking.room_id, self.new_room.id)
        self.assertEqual(booking.check_in_date, date(2026, 5, 21))
        self.assertEqual(booking.check_out_date, date(2026, 5, 24))
        self.assertEqual(booking.number_of_guests, 2)
        self.assertEqual(booking.special_requests, 'Twin beds')
        self.assertEqual(booking.total_amount, 360)

    def test_modification_is_blocked_when_target_room_overlaps(self):
        blocker_guest = Guest.objects.create(
            first_name='Blocker',
            last_name='Guest',
            email='blocker.modification@example.com',
        )
        Booking.objects.create(
            room=self.new_room,
            guest=blocker_guest,
            check_in_date=date(2026, 5, 22),
            check_out_date=date(2026, 5, 25),
            number_of_guests=1,
            status='confirmed',
        )

        with self.assertRaises(ValueError):
            modify_confirmed_booking(
                self.booking,
                room=self.new_room,
                check_in_date=date(2026, 5, 21),
                check_out_date=date(2026, 5, 24),
            )

        self.booking.refresh_from_db()
        self.assertEqual(self.booking.room_id, self.room.id)
        self.assertEqual(self.booking.check_in_date, date(2026, 5, 20))

    def test_checked_in_booking_cannot_be_modified_as_reservation(self):
        self.booking.status = 'checked_in'
        self.booking.save(update_fields=['status', 'updated_at'])

        with self.assertRaises(ValueError):
            modify_confirmed_booking(self.booking, check_out_date=date(2026, 5, 24))

    def test_tenant_user_can_modify_booking_from_api(self):
        response = self.client.post(
            f'/api/v1/bookings/bookings/{self.booking.id}/modify/',
            {
                'room': str(self.new_room.id),
                'check_in_date': '2026-05-21',
                'check_out_date': '2026-05-23',
                'number_of_guests': 2,
                'special_requests': 'Late arrival',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.assertEqual(self.booking.room_id, self.new_room.id)
        self.assertEqual(self.booking.total_amount, 240)
        self.assertEqual(response.data['booking']['special_requests'], 'Late arrival')


class WalkInBookingTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_walkin'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-walkin.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant Walkin'
        tenant.created_by = 'test'

    def setUp(self):
        super().setUp()
        self.client = APIClient(HTTP_HOST=self.get_test_tenant_domain())
        self.user = PlatformUser.objects.create_user(
            email='frontdesk-walkin@example.com',
            password='testpass123456',
            tenant=self.tenant,
            is_tenant_admin=True,
        )
        self.client.force_authenticate(self.user)
        self.room_type = RoomType.objects.create(
            name='Walkin Standard',
            code='WLK-STD',
            base_rate='150.00',
        )
        self.room = Room.objects.create(
            room_number='901',
            room_type=self.room_type,
            capacity=2,
            price_per_night='150.00',
            status='available',
        )
        self.guest = Guest.objects.create(
            first_name='Walkin',
            last_name='Guest',
            email='walkin.guest@example.com',
        )

    def test_walk_in_service_checks_in_guest_and_opens_folio(self):
        booking, folio = create_walk_in_booking(
            room=self.room,
            guest=self.guest,
            check_in_date=date(2026, 5, 20),
            check_out_date=date(2026, 5, 22),
            number_of_guests=2,
            special_requests='Near elevator',
        )

        self.room.refresh_from_db()

        self.assertEqual(booking.status, 'checked_in')
        self.assertEqual(booking.total_amount, 300)
        self.assertEqual(booking.special_requests, 'Near elevator')
        self.assertEqual(self.room.status, 'occupied')
        self.assertEqual(folio.status, 'open')
        self.assertEqual(folio.subtotal, booking.total_amount)

    def test_walk_in_service_requires_available_room(self):
        self.room.status = 'cleaning'
        self.room.save(update_fields=['status', 'updated_at'])

        with self.assertRaises(ValueError):
            create_walk_in_booking(
                room=self.room,
                guest=self.guest,
                check_in_date=date(2026, 5, 20),
                check_out_date=date(2026, 5, 21),
            )

        self.assertFalse(Booking.objects.exists())

    def test_tenant_user_can_create_walk_in_from_api(self):
        response = self.client.post(
            '/api/v1/bookings/bookings/walk-in/',
            {
                'room': str(self.room.id),
                'guest': str(self.guest.id),
                'check_in_date': '2026-05-20',
                'check_out_date': '2026-05-21',
                'number_of_guests': 1,
                'special_requests': 'Cash payer',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        booking = Booking.objects.get()
        self.room.refresh_from_db()
        self.assertEqual(booking.status, 'checked_in')
        self.assertEqual(self.room.status, 'occupied')
        self.assertTrue(GuestFolio.objects.filter(booking=booking, status='open').exists())
        self.assertEqual(response.data['booking']['special_requests'], 'Cash payer')


class ReservationCheckInFolioTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_checkin_folio'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-checkin-folio.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant Checkin Folio'
        tenant.created_by = 'test'

    def setUp(self):
        super().setUp()
        self.client = APIClient(HTTP_HOST=self.get_test_tenant_domain())
        self.user = PlatformUser.objects.create_user(
            email='frontdesk-checkin-folio@example.com',
            password='testpass123456',
            tenant=self.tenant,
            is_tenant_admin=True,
        )
        self.client.force_authenticate(self.user)
        self.room_type = RoomType.objects.create(
            name='Checkin Standard',
            code='CHK-STD',
            base_rate='110.00',
        )
        self.room = Room.objects.create(
            room_number='911',
            room_type=self.room_type,
            capacity=2,
            price_per_night='110.00',
            status='available',
        )
        self.guest = Guest.objects.create(
            first_name='Checkin',
            last_name='Guest',
            email='checkin.folio@example.com',
        )
        self.booking = Booking.objects.create(
            room=self.room,
            guest=self.guest,
            check_in_date=date(2026, 5, 24),
            check_out_date=date(2026, 5, 26),
            number_of_guests=1,
            status='confirmed',
        )

    def test_check_in_service_opens_folio_and_occupies_room(self):
        booking, folio = check_in_booking(self.booking)

        self.room.refresh_from_db()

        self.assertEqual(booking.status, 'checked_in')
        self.assertEqual(self.room.status, 'occupied')
        self.assertEqual(folio.status, 'open')
        self.assertEqual(folio.subtotal, booking.total_amount)
        self.assertEqual(folio.grand_total, booking.total_amount)
        self.assertTrue(
            GuestFolioLine.objects.filter(
                folio=folio,
                source_module='room_charge',
                amount=booking.total_amount,
            ).exists()
        )

    def test_check_in_api_returns_open_folio(self):
        response = self.client.post(f'/api/v1/bookings/bookings/{self.booking.id}/check_in/')

        self.assertEqual(response.status_code, 200)
        self.booking.refresh_from_db()
        self.room.refresh_from_db()
        folio = GuestFolio.objects.get(booking=self.booking)
        self.assertEqual(self.booking.status, 'checked_in')
        self.assertEqual(self.room.status, 'occupied')
        self.assertEqual(folio.status, 'open')
        self.assertEqual(response.data['folio']['id'], str(folio.id))

    def test_facility_service_can_be_created_and_posted_to_open_folio(self):
        _, folio = check_in_booking(self.booking)

        amenity_response = self.client.post(
            '/api/v1/bookings/facility-amenities/',
            {
                'name': 'Pool',
                'code': 'POOL',
                'description': 'Pool facilities',
                'is_active': True,
            },
            format='json',
        )

        self.assertEqual(amenity_response.status_code, 201)
        amenity = FacilityAmenity.objects.get(code='POOL')

        create_response = self.client.post(
            '/api/v1/bookings/facility-services/',
            {
                'name': 'Pool Day Pass',
                'code': 'POOL-DAY',
                'amenity': str(amenity.id),
                'category': 'other',
                'default_price': '25.00',
                'description': 'Daily pool access',
                'is_active': True,
            },
            format='json',
        )

        self.assertEqual(create_response.status_code, 201)
        service = FacilityService.objects.get(code='POOL-DAY')

        charge_response = self.client.post(
            f'/api/v1/bookings/folios/{folio.id}/add-charge/',
            {
                'facility_service': str(service.id),
                'description': service.name,
                'amount': str(service.default_price),
            },
            format='json',
        )

        self.assertEqual(charge_response.status_code, 201)
        line = GuestFolioLine.objects.get(folio=folio, description='Pool Day Pass')
        self.assertEqual(line.source_module, 'facility_pool')
        self.assertEqual(line.amount, service.default_price)
        folio.refresh_from_db()
        self.assertEqual(folio.grand_total, folio.subtotal + service.default_price)

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
    def test_checkout_api_settles_folio_and_marks_room_for_cleaning(self):
        booking, folio = check_in_booking(self.booking)

        response = self.client.post(
            f'/api/v1/bookings/bookings/{booking.id}/check_out/',
            {
                'payment_method': 'cash',
                'paid_amount': str(folio.grand_total),
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        booking.refresh_from_db()
        folio.refresh_from_db()
        self.room.refresh_from_db()
        self.assertEqual(booking.status, 'checked_out')
        self.assertEqual(folio.status, 'paid')
        self.assertEqual(self.room.status, 'cleaning')
        self.assertTrue(HousekeepingTask.objects.filter(room=self.room, task_type='checkout_clean', status='open').exists())

    @override_settings(DEBUG=True, EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_email_queue_failure_does_not_block_local_flow(self):
        with patch('bookings.tasks.send_booking_confirmation_email.delay', side_effect=OperationalError('redis down')):
            queue_booking_confirmation_email(self.booking.id, self.guest.email)


class BookingPdfExportTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_pdf'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-pdf.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant PDF'
        tenant.created_by = 'test'
        tenant.currency = 'NPR'

    def setUp(self):
        super().setUp()
        self.client = APIClient(HTTP_HOST=self.get_test_tenant_domain())
        self.user = PlatformUser.objects.create_user(
            email='frontdesk-pdf@example.com',
            password='testpass123456',
            tenant=self.tenant,
            is_tenant_admin=True,
        )
        self.client.force_authenticate(self.user)
        self.room_type = RoomType.objects.create(
            name='PDF Standard',
            code='PDF-STD',
            base_rate='100.00',
        )
        self.room = Room.objects.create(
            room_number='701',
            room_type=self.room_type,
            capacity=2,
            price_per_night='100.00',
        )
        self.guest = Guest.objects.create(
            first_name='Paper',
            last_name='Guest',
            email='paper.guest@example.com',
        )
        self.booking = Booking.objects.create(
            room=self.room,
            guest=self.guest,
            check_in_date=date(2026, 5, 20),
            check_out_date=date(2026, 5, 22),
            number_of_guests=2,
            status='confirmed',
            special_requests='High floor',
        )
        self.folio = GuestFolio.objects.create(booking=self.booking, subtotal=self.booking.total_amount)
        GuestFolioLine.objects.create(
            folio=self.folio,
            source_module='test',
            source_id='minibar-1',
            description='Minibar',
            amount='25.00',
        )

    def test_booking_confirmation_pdf_endpoint_returns_pdf(self):
        response = self.client.get(f'/api/v1/bookings/bookings/{self.booking.id}/confirmation-pdf/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertTrue(response.content.startswith(b'%PDF-'))
        self.assertIn('reservation-', response['Content-Disposition'])

    def test_guest_folio_pdf_endpoint_returns_pdf(self):
        response = self.client.get(f'/api/v1/bookings/folios/{self.folio.id}/pdf/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertTrue(response.content.startswith(b'%PDF-'))
        self.assertIn('.pdf', response['Content-Disposition'])
