from datetime import date
from unittest.mock import patch

from django.db import connection
from django_tenants.test.cases import TenantTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from bookings.models import Booking, Guest, RatePlan, Room, RoomType
from audit.models import AuditLog
from integrations.models import OTAChannel, OTAChannelRatePlanMapping, OTAChannelRoomTypeMapping, OTAReservationImport, OTASyncJob, OTAWebhookEvent
from integrations.services import activate_zodomus_rooms, build_availability_payload, run_availability_sync, run_rate_sync
from integrations.views import OTAChannelViewSet
from notifications.models import NotificationEvent
from users.models import PlatformUser


class OTAChannelSyncFoundationTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_ota_sync'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-ota-sync.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant OTA Sync'
        tenant.created_by = 'test'

    def setUp(self):
        self.channel = OTAChannel.objects.create(name='Booking.com', code='booking', provider='booking_com', is_active=True)
        self.room_type = RoomType.objects.create(name='OTA Deluxe', code='OTA-DLX', base_rate='1000.00')
        self.room_one = Room.objects.create(room_number='OTA101', room_type=self.room_type, price_per_night='1000.00')
        self.room_two = Room.objects.create(room_number='OTA102', room_type=self.room_type, price_per_night='1000.00')
        self.mapping = OTAChannelRoomTypeMapping.objects.create(
            channel=self.channel,
            room_type=self.room_type,
            external_room_type_id='EXT-DLX',
        )

    def test_availability_payload_subtracts_overlapping_bookings(self):
        guest = Guest.objects.create(first_name='Ota', last_name='Guest', email='ota-guest@example.com')
        Booking.objects.create(
            room=self.room_one,
            guest=guest,
            check_in_date=date(2026, 6, 1),
            check_out_date=date(2026, 6, 3),
            number_of_guests=1,
            total_amount='2000.00',
            status='confirmed',
        )

        payload = build_availability_payload(self.channel, date_from=date(2026, 6, 1), date_to=date(2026, 6, 4))
        rows = {row['date']: row for row in payload}

        self.assertEqual(rows['2026-06-01']['available'], 1)
        self.assertEqual(rows['2026-06-02']['available'], 1)
        self.assertEqual(rows['2026-06-03']['available'], 2)
        self.assertEqual(rows['2026-06-01']['external_room_type_id'], 'EXT-DLX')

    def test_rate_sync_job_records_payload_summary_and_last_sync(self):
        rate_plan = RatePlan.objects.create(
            name='OTA BAR',
            room_type=self.room_type,
            base_rate='1200.00',
            valid_from=date(2026, 6, 1),
            valid_to=date(2026, 6, 30),
        )
        OTAChannelRatePlanMapping.objects.create(
            channel=self.channel,
            rate_plan=rate_plan,
            external_rate_plan_id='EXT-BAR',
        )

        job = run_rate_sync(self.channel, date_from=date(2026, 6, 1), date_to=date(2026, 6, 3))
        self.channel.refresh_from_db()

        self.assertEqual(job.status, 'succeeded')
        self.assertEqual(job.summary['records'], 2)
        self.assertEqual(job.summary['payload'][0]['external_rate_plan_id'], 'EXT-BAR')
        self.assertIsNotNone(self.channel.last_sync)

    def test_webhook_endpoint_is_idempotent(self):
        request = APIRequestFactory().post(
            f'/integrations/ota-channels/{self.channel.id}/webhook/',
            {'event_id': 'OTA-EVENT-1', 'event_type': 'reservation.created', 'reservation_id': 'R-100', 'external_room_type_id': 'EXT-DLX', 'check_in_date': '2026-06-01', 'check_out_date': '2026-06-03'},
            format='json',
        )
        duplicate_request = APIRequestFactory().post(
            f'/integrations/ota-channels/{self.channel.id}/webhook/',
            {'event_id': 'OTA-EVENT-1', 'event_type': 'reservation.created', 'reservation_id': 'R-100', 'external_room_type_id': 'EXT-DLX', 'check_in_date': '2026-06-01', 'check_out_date': '2026-06-03'},
            format='json',
        )
        response = OTAChannelViewSet.as_view({'post': 'webhook'})(request, pk=self.channel.id)
        duplicate = OTAChannelViewSet.as_view({'post': 'webhook'})(duplicate_request, pk=self.channel.id)

        self.assertEqual(response.status_code, 202)
        self.assertEqual(duplicate.status_code, 200)
        self.assertEqual(OTAWebhookEvent.objects.count(), 1)
        self.assertEqual(OTAWebhookEvent.objects.first().status, 'processed')
        self.assertEqual(OTASyncJob.objects.filter(sync_type='webhook', status='succeeded').count(), 1)
        self.assertEqual(OTAReservationImport.objects.count(), 1)
        self.assertEqual(OTAReservationImport.objects.first().status, 'pending')

    def test_tenant_admin_can_trigger_availability_sync(self):
        user = PlatformUser.objects.create_user(email='ota-admin@example.com', password='testpass123456', tenant=connection.tenant, is_tenant_admin=True)
        request = APIRequestFactory().post(
            f'/integrations/ota-channels/{self.channel.id}/sync-availability/',
            {'date_from': '2026-06-01', 'date_to': '2026-06-03'},
            format='json',
        )
        force_authenticate(request, user=user)
        response = OTAChannelViewSet.as_view({'post': 'sync_availability'})(request, pk=self.channel.id)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['sync_type'], 'availability_push')
        self.assertEqual(response.data['summary']['records'], 2)

    @patch('integrations.services._zodomus_request', return_value={'status': 'ok'})
    def test_zodomus_availability_sync_pushes_to_provider(self, zodomus_request_mock):
        self.channel.provider = 'zodomus'
        self.channel.api_key = 'api-user'
        self.channel.api_secret = 'api-password'
        self.channel.base_url = 'https://api.zodomus.com'
        self.channel.settings = {'property_id': 'ZP-100', 'channel_id': 1}
        self.channel.save(update_fields=['provider', 'api_key', 'api_secret', 'base_url', 'settings'])

        job = run_availability_sync(self.channel, date_from=date(2026, 6, 1), date_to=date(2026, 6, 2))

        self.assertEqual(job.status, 'succeeded')
        self.assertEqual(job.summary['provider_response']['requests'], 1)
        self.assertEqual(job.summary['provider_response']['responses'][0], {'status': 'ok'})
        zodomus_request_mock.assert_called_once()
        channel, method, path, payload = zodomus_request_mock.call_args.args
        self.assertEqual(channel, self.channel)
        self.assertEqual(method, 'POST')
        self.assertEqual(path, '/availability')
        self.assertEqual(payload['propertyId'], 'ZP-100')
        self.assertEqual(payload['roomId'], 'EXT-DLX')
        self.assertEqual(payload['availability'], 2)

    @patch('integrations.services._zodomus_request', return_value={'properties': [{'id': 'ZP-DISCOVERED'}], 'channels': [{'id': 1, 'channel': 'Booking.com'}]})
    def test_zodomus_connection_check_endpoint(self, zodomus_request_mock):
        self.channel.provider = 'zodomus'
        self.channel.api_key = 'api-user'
        self.channel.api_secret = 'api-password'
        self.channel.save(update_fields=['provider', 'api_key', 'api_secret'])
        user = PlatformUser.objects.create_user(email='ota-zodomus@example.com', password='testpass123456', tenant=connection.tenant, is_tenant_admin=True)
        request = APIRequestFactory().post(f'/integrations/ota-channels/{self.channel.id}/check-connection/', {}, format='json')
        force_authenticate(request, user=user)

        response = OTAChannelViewSet.as_view({'post': 'check_connection'})(request, pk=self.channel.id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'ok')
        self.assertEqual(response.data['provider_response']['channels'][0]['id'], 1)
        self.assertEqual(response.data['property_id'], 'ZP-DISCOVERED')
        self.channel.refresh_from_db()
        self.assertEqual(self.channel.settings['property_id'], 'ZP-DISCOVERED')
        zodomus_request_mock.assert_called_once_with(self.channel, 'GET', '/channels')

    @patch('integrations.services._zodomus_request', return_value={'rooms': [{'id': 'RM-1'}], 'rates': [{'id': 'RATE-1'}]})
    def test_zodomus_inventory_discovery_endpoint(self, zodomus_request_mock):
        self.channel.provider = 'zodomus'
        self.channel.api_key = 'api-user'
        self.channel.api_secret = 'api-password'
        self.channel.settings = {'property_id': 'ZP-100', 'channel_id': 1, 'channel_code': 'booking'}
        self.channel.save(update_fields=['provider', 'api_key', 'api_secret', 'settings'])
        user = PlatformUser.objects.create_user(email='ota-discovery@example.com', password='testpass123456', tenant=connection.tenant, is_tenant_admin=True)
        request = APIRequestFactory().post(f'/integrations/ota-channels/{self.channel.id}/discover-inventory/', {}, format='json')
        force_authenticate(request, user=user)

        response = OTAChannelViewSet.as_view({'post': 'discover_inventory'})(request, pk=self.channel.id)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'ok')
        self.assertEqual(response.data['provider_response']['rooms'][0]['id'], 'RM-1')
        zodomus_request_mock.assert_called_once_with(
            self.channel,
            'GET',
            '/room-rates',
            query={'propertyId': 'ZP-100', 'channelId': 1},
        )

    @patch('integrations.services._zodomus_request', return_value={'status': {'returnCode': 200}})
    def test_zodomus_room_activation_uses_rate_id_array(self, zodomus_request_mock):
        self.channel.provider = 'zodomus'
        self.channel.api_key = 'api-user'
        self.channel.api_secret = 'api-password'
        self.channel.settings = {'property_id': 'ZP-100', 'channel_id': 1}
        self.channel.save(update_fields=['provider', 'api_key', 'api_secret', 'settings'])
        rate_plan = RatePlan.objects.create(
            name='OTA BAR',
            room_type=self.room_type,
            base_rate='1200.00',
            valid_from=date(2026, 6, 1),
            valid_to=date(2026, 6, 30),
        )
        OTAChannelRatePlanMapping.objects.create(
            channel=self.channel,
            rate_plan=rate_plan,
            external_rate_plan_id='EXT-BAR',
        )

        response = activate_zodomus_rooms(self.channel)

        self.assertEqual(response['status']['returnCode'], 200)
        zodomus_request_mock.assert_called_once()
        call_channel, method, path = zodomus_request_mock.call_args.args
        payload = zodomus_request_mock.call_args.kwargs['payload']
        self.assertEqual(call_channel, self.channel)
        self.assertEqual(method, 'POST')
        self.assertEqual(path, '/rooms-activation')
        self.assertEqual(payload['channelId'], 1)
        self.assertEqual(payload['propertyId'], 'ZP-100')
        self.assertEqual(payload['rooms'][0]['rates'], ['EXT-BAR'])

    @patch('integrations.services._zodomus_request')
    def test_zodomus_pull_reservations_creates_imports(self, zodomus_request_mock):
        self.channel.provider = 'zodomus'
        self.channel.api_key = 'api-user'
        self.channel.api_secret = 'api-password'
        self.channel.settings = {'property_id': 'ZP-100', 'channel_id': 1}
        self.channel.save(update_fields=['provider', 'api_key', 'api_secret', 'settings'])
        zodomus_request_mock.side_effect = [
            {
                'reservations': [
                    {'id': 'TEST-200', 'status': 1, 'date': '2026-06-01'},
                ]
            },
            {
                'reservations': {
                    'reservation': {
                        'id': 'TEST-200',
                        'status': 1,
                        'currencyCode': 'EUR',
                        'totalPrice': '260',
                    },
                    'customer': {
                        'firstName': 'John',
                        'lastName': 'Mendes',
                        'email': 'john@example.com',
                    },
                    'rooms': [
                        {
                            'id': 'EXT-DLX',
                            'numberOfGuests': 2,
                            'arrivalDate': '2026-06-10',
                            'departureDate': '2026-06-12',
                            'prices': [{'rateId': 'EXT-BAR'}],
                        }
                    ],
                }
            },
        ]

        from integrations.services import pull_zodomus_reservations

        job = pull_zodomus_reservations(self.channel)
        reservation_import = OTAReservationImport.objects.get(external_reservation_id='TEST-200')

        self.assertEqual(job.status, 'succeeded')
        self.assertEqual(job.summary['records'], 1)
        self.assertEqual(reservation_import.channel, self.channel)
        self.assertEqual(reservation_import.external_room_type_id, 'EXT-DLX')
        self.assertEqual(reservation_import.external_rate_plan_id, 'EXT-BAR')
        self.assertEqual(reservation_import.status, 'pending')
        self.assertEqual(reservation_import.guest_email, 'john@example.com')

    @patch('integrations.services._zodomus_request', return_value={'reservation_id': 'TEST-100'})
    def test_zodomus_test_reservation_endpoint_records_job(self, zodomus_request_mock):
        self.channel.provider = 'zodomus'
        self.channel.api_key = 'api-user'
        self.channel.api_secret = 'api-password'
        self.channel.settings = {'property_id': 'ZP-100', 'channel_id': 1}
        self.channel.save(update_fields=['provider', 'api_key', 'api_secret', 'settings'])
        user = PlatformUser.objects.create_user(email='ota-test-reservation@example.com', password='testpass123456', tenant=connection.tenant, is_tenant_admin=True)
        request = APIRequestFactory().post(
            f'/integrations/ota-channels/{self.channel.id}/create-test-reservation/',
            {
                'external_room_type_id': 'EXT-DLX',
                'external_rate_plan_id': 'EXT-BAR',
                'check_in_date': '2026-06-01',
                'check_out_date': '2026-06-03',
                'guest_first_name': 'Sandbox',
                'guest_last_name': 'Guest',
                'guest_email': 'sandbox@example.com',
                'total_amount': '200.00',
            },
            format='json',
        )
        force_authenticate(request, user=user)

        response = OTAChannelViewSet.as_view({'post': 'create_test_reservation'})(request, pk=self.channel.id)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['sync_type'], 'booking_pull')
        self.assertEqual(response.data['summary']['provider_response']['reservation_id'], 'TEST-100')
        channel, method, path, payload = zodomus_request_mock.call_args.args
        self.assertEqual(channel, self.channel)
        self.assertEqual(method, 'POST')
        self.assertEqual(path, '/reservations-createtest')
        self.assertEqual(payload['propertyId'], 'ZP-100')
        self.assertEqual(payload['channelId'], 1)
        self.assertEqual(payload['status'], 'new')
        self.assertTrue(payload['reservationId'].startswith('TEST-'))
        self.assertEqual(payload['external_room_type_id'], 'EXT-DLX')

    def test_webhook_import_flags_missing_mapping_conflict(self):
        PlatformUser.objects.create_user(email='ota-manager@example.com', password='testpass123456', tenant=connection.tenant, is_tenant_admin=True)
        request = APIRequestFactory().post(
            f'/integrations/ota-channels/{self.channel.id}/webhook/',
            {
                'event_id': 'OTA-EVENT-MISSING-MAP',
                'event_type': 'reservation.created',
                'reservation_id': 'R-MISSING',
                'external_room_type_id': 'UNKNOWN',
                'check_in_date': '2026-06-01',
                'check_out_date': '2026-06-03',
                'guest_email': 'mapping-missing@example.com',
            },
            format='json',
        )

        response = OTAChannelViewSet.as_view({'post': 'webhook'})(request, pk=self.channel.id)
        reservation_import = OTAReservationImport.objects.get(external_reservation_id='R-MISSING')

        self.assertEqual(response.status_code, 202)
        self.assertEqual(reservation_import.status, 'conflict')
        self.assertEqual(reservation_import.conflict_type, 'missing_mapping')
        self.assertTrue(NotificationEvent.objects.filter(event_type='ota.reservation_review', module='integrations').exists())
        self.assertTrue(AuditLog.objects.filter(object_id=str(reservation_import.id), metadata__source='ota_webhook').exists())

    def test_accept_reservation_import_creates_booking(self):
        user = PlatformUser.objects.create_user(email='ota-reviewer@example.com', password='testpass123456', tenant=connection.tenant, is_tenant_admin=True)
        request = APIRequestFactory().post(
            f'/integrations/ota-channels/{self.channel.id}/webhook/',
            {
                'event_id': 'OTA-EVENT-ACCEPT',
                'event_type': 'reservation.created',
                'reservation_id': 'R-ACCEPT',
                'external_room_type_id': 'EXT-DLX',
                'check_in_date': '2026-07-01',
                'check_out_date': '2026-07-03',
                'guest_first_name': 'Accepted',
                'guest_last_name': 'Guest',
                'guest_email': 'accepted-ota@example.com',
                'number_of_guests': 1,
            },
            format='json',
        )
        OTAChannelViewSet.as_view({'post': 'webhook'})(request, pk=self.channel.id)
        reservation_import = OTAReservationImport.objects.get(external_reservation_id='R-ACCEPT')
        accept_request = APIRequestFactory().post(
            f'/integrations/ota-reservation-imports/{reservation_import.id}/accept/',
            {'notes': 'Looks good.'},
            format='json',
        )
        force_authenticate(accept_request, user=user)

        from integrations.views import OTAReservationImportViewSet

        response = OTAReservationImportViewSet.as_view({'post': 'accept'})(accept_request, pk=reservation_import.id)
        reservation_import.refresh_from_db()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(reservation_import.status, 'accepted')
        self.assertIsNotNone(reservation_import.booking)
        self.assertEqual(reservation_import.booking.guest.email, 'accepted-ota@example.com')
        self.assertTrue(NotificationEvent.objects.filter(event_type='ota.reservation_accepted', module='integrations').exists())
        self.assertTrue(AuditLog.objects.filter(object_id=str(reservation_import.id), metadata__action='accept_ota_reservation').exists())

    def test_reject_reservation_import_records_review(self):
        user = PlatformUser.objects.create_user(email='ota-rejecter@example.com', password='testpass123456', tenant=connection.tenant, is_tenant_admin=True)
        reservation_import = OTAReservationImport.objects.create(
            channel=self.channel,
            external_reservation_id='R-REJECT',
            external_room_type_id='EXT-DLX',
            status='conflict',
            conflict_type='no_room_available',
            conflict_message='No local room is available.',
        )
        reject_request = APIRequestFactory().post(
            f'/integrations/ota-reservation-imports/{reservation_import.id}/reject/',
            {'notes': 'Rejected in test.'},
            format='json',
        )
        force_authenticate(reject_request, user=user)

        from integrations.views import OTAReservationImportViewSet

        response = OTAReservationImportViewSet.as_view({'post': 'reject'})(reject_request, pk=reservation_import.id)
        reservation_import.refresh_from_db()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(reservation_import.status, 'rejected')
        self.assertEqual(reservation_import.reviewed_by, user)
        self.assertEqual(reservation_import.review_notes, 'Rejected in test.')
        self.assertTrue(NotificationEvent.objects.filter(event_type='ota.reservation_rejected', module='integrations').exists())
        self.assertTrue(AuditLog.objects.filter(object_id=str(reservation_import.id), metadata__action='reject_ota_reservation').exists())

    def test_modification_webhook_can_be_applied_to_confirmed_booking(self):
        user = PlatformUser.objects.create_user(email='ota-mod-reviewer@example.com', password='testpass123456', tenant=connection.tenant, is_tenant_admin=True)
        guest = Guest.objects.create(first_name='Modify', last_name='Guest', email='modify-ota@example.com')
        booking = Booking.objects.create(
            room=self.room_one,
            guest=guest,
            check_in_date=date(2026, 8, 1),
            check_out_date=date(2026, 8, 3),
            number_of_guests=1,
            total_amount='2000.00',
            status='confirmed',
        )
        reservation_import = OTAReservationImport.objects.create(
            channel=self.channel,
            booking=booking,
            external_reservation_id='R-MODIFY',
            external_room_type_id='EXT-DLX',
            status='accepted',
        )
        request = APIRequestFactory().post(
            f'/integrations/ota-channels/{self.channel.id}/webhook/',
            {
                'event_id': 'OTA-EVENT-MODIFY',
                'event_type': 'reservation.modified',
                'reservation_id': 'R-MODIFY',
                'external_room_type_id': 'EXT-DLX',
                'check_in_date': '2026-08-02',
                'check_out_date': '2026-08-04',
                'number_of_guests': 1,
            },
            format='json',
        )
        OTAChannelViewSet.as_view({'post': 'webhook'})(request, pk=self.channel.id)
        reservation_import.refresh_from_db()
        self.assertEqual(reservation_import.conflict_type, 'modification_review')

        from integrations.views import OTAReservationImportViewSet

        apply_request = APIRequestFactory().post(
            f'/integrations/ota-reservation-imports/{reservation_import.id}/apply-modification/',
            {'notes': 'Apply OTA date change.'},
            format='json',
        )
        force_authenticate(apply_request, user=user)
        response = OTAReservationImportViewSet.as_view({'post': 'apply_modification'})(apply_request, pk=reservation_import.id)
        booking.refresh_from_db()
        reservation_import.refresh_from_db()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(reservation_import.status, 'accepted')
        self.assertEqual(booking.check_in_date, date(2026, 8, 2))
        self.assertEqual(booking.check_out_date, date(2026, 8, 4))
        self.assertTrue(NotificationEvent.objects.filter(event_type='ota.reservation_modified', module='integrations').exists())
        self.assertTrue(AuditLog.objects.filter(object_id=str(reservation_import.id), metadata__action='apply_ota_modification').exists())

    def test_cancellation_webhook_can_cancel_confirmed_booking(self):
        user = PlatformUser.objects.create_user(email='ota-cancel-reviewer@example.com', password='testpass123456', tenant=connection.tenant, is_tenant_admin=True)
        guest = Guest.objects.create(first_name='Cancel', last_name='Guest', email='cancel-ota@example.com')
        booking = Booking.objects.create(
            room=self.room_one,
            guest=guest,
            check_in_date=date(2026, 9, 1),
            check_out_date=date(2026, 9, 3),
            number_of_guests=1,
            total_amount='2000.00',
            status='confirmed',
        )
        reservation_import = OTAReservationImport.objects.create(
            channel=self.channel,
            booking=booking,
            external_reservation_id='R-CANCEL',
            external_room_type_id='EXT-DLX',
            status='accepted',
        )
        request = APIRequestFactory().post(
            f'/integrations/ota-channels/{self.channel.id}/webhook/',
            {
                'event_id': 'OTA-EVENT-CANCEL',
                'event_type': 'reservation.canceled',
                'reservation_id': 'R-CANCEL',
            },
            format='json',
        )
        OTAChannelViewSet.as_view({'post': 'webhook'})(request, pk=self.channel.id)
        reservation_import.refresh_from_db()
        self.assertEqual(reservation_import.conflict_type, 'cancellation_review')

        from integrations.views import OTAReservationImportViewSet

        apply_request = APIRequestFactory().post(
            f'/integrations/ota-reservation-imports/{reservation_import.id}/apply-cancellation/',
            {'notes': 'Apply OTA cancellation.'},
            format='json',
        )
        force_authenticate(apply_request, user=user)
        response = OTAReservationImportViewSet.as_view({'post': 'apply_cancellation'})(apply_request, pk=reservation_import.id)
        booking.refresh_from_db()
        reservation_import.refresh_from_db()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(booking.status, 'cancelled')
        self.assertEqual(reservation_import.status, 'canceled')
        self.assertTrue(NotificationEvent.objects.filter(event_type='ota.reservation_canceled', module='integrations').exists())
        self.assertTrue(AuditLog.objects.filter(object_id=str(reservation_import.id), metadata__action='apply_ota_cancellation').exists())
