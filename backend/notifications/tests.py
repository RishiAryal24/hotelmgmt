from unittest.mock import patch

from django.db import connection
from django_tenants.test.cases import TenantTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from bookings.models import Room, RoomType
from housekeeping.models import HousekeepingTask
from maintenance.models import MaintenanceTicket
from notifications.models import NotificationEvent, NotificationTemplate
from notifications.providers import deliver_notification
from notifications.services import create_housekeeping_escalation_notification, create_manager_notification_events, create_notification_event, deliver_email_notification
from notifications.tasks import cancel_notification_delivery, retry_notification_delivery
from notifications.views import NotificationEventViewSet
from tenants.serializers import TenantSettingsSerializer
from users.models import PlatformUser, Role


class NotificationFoundationTests(TenantTestCase):
    @classmethod
    def get_test_schema_name(cls):
        return 'tenant_notifications'

    @classmethod
    def get_test_tenant_domain(cls):
        return 'tenant-notifications.test.com'

    @classmethod
    def setup_tenant(cls, tenant):
        tenant.name = 'Tenant Notifications'
        tenant.created_by = 'test'

    def test_template_renders_event_payload(self):
        template = NotificationTemplate.objects.create(
            code='booking-confirmation',
            name='Booking confirmation',
            channel='email',
            subject_template='Booking {booking_number}',
            body_template='Hello {guest_name}, your room is {room_number}.',
        )

        event = create_notification_event(
            channel='',
            template=template,
            event_type='booking.confirmed',
            module='bookings',
            context={'booking_number': 'B-1001', 'guest_name': 'Maya', 'room_number': '101'},
            recipient_email='maya@example.com',
            payload={'booking_id': 'B-1001'},
        )

        self.assertEqual(event.channel, 'email')
        self.assertEqual(event.subject, 'Booking B-1001')
        self.assertEqual(event.message, 'Hello Maya, your room is 101.')
        self.assertEqual(event.payload['booking_id'], 'B-1001')

    @patch('notifications.providers.send_mail')
    def test_email_delivery_updates_status(self, send_mail_mock):
        event = NotificationEvent.objects.create(
            channel='email',
            event_type='inventory.low_stock',
            module='inventory',
            subject='Low stock',
            message='Coffee beans are below reorder level.',
            recipient_email='manager@example.com',
        )

        deliver_email_notification(event)
        event.refresh_from_db()

        self.assertEqual(event.status, 'sent')
        self.assertEqual(event.provider, 'django-email')
        self.assertEqual(event.attempts, 1)
        self.assertIsNotNone(event.sent_at)
        send_mail_mock.assert_called_once()

    @patch('notifications.providers.send_mail', side_effect=RuntimeError('smtp down'))
    def test_email_delivery_failure_is_logged(self, send_mail_mock):
        event = NotificationEvent.objects.create(
            channel='email',
            event_type='payroll.posted',
            module='hrms',
            subject='Payroll posted',
            message='Payroll has been posted.',
            recipient_email='owner@example.com',
        )

        with self.assertRaises(RuntimeError):
            deliver_email_notification(event)
        event.refresh_from_db()

        self.assertEqual(event.status, 'failed')
        self.assertEqual(event.attempts, 1)
        self.assertIn('smtp down', event.error_message)

    def test_housekeeping_escalation_event_payload_links_task_ticket_and_room(self):
        suffix = str(abs(hash(self._testMethodName)) % 100000)
        room_type = RoomType.objects.create(name=f'Deluxe {suffix}', code=f'DLX-{suffix}', base_rate='100.00')
        room = Room.objects.create(room_number=f'5{suffix[-2:]}', room_type=room_type, price_per_night='100.00')
        task = HousekeepingTask.objects.create(room=room, priority='urgent', notes='Leak under sink')
        ticket = MaintenanceTicket.objects.create(room=room, title=f'Housekeeping escalation - Room {room.room_number}', priority='urgent')

        event = create_housekeeping_escalation_notification(task, ticket)

        self.assertEqual(event.event_type, 'housekeeping.escalated')
        self.assertEqual(event.module, 'housekeeping')
        self.assertEqual(event.priority, 'urgent')
        self.assertEqual(event.payload['task_id'], str(task.id))
        self.assertEqual(event.payload['ticket_id'], str(ticket.id))
        self.assertEqual(event.payload['room_number'], room.room_number)

    def test_manager_notification_events_target_admin_and_module_managers(self):
        tenant = connection.tenant
        tenant_admin = PlatformUser.objects.create_user(email='tenant-admin-notify@example.com', password='testpass123456', tenant=tenant, is_tenant_admin=True)
        inventory_role, _ = Role.objects.get_or_create(code='inventory_manager', defaults={'name': 'Inventory Manager'})
        inventory_manager = PlatformUser.objects.create_user(email='inventory-manager@example.com', password='testpass123456', tenant=tenant)
        inventory_manager.roles.add(inventory_role)
        PlatformUser.objects.create_user(email='frontdesk-no-notify@example.com', password='testpass123456', tenant=tenant)

        events = create_manager_notification_events(
            channel='in_app',
            event_type='inventory.low_stock',
            module='inventory',
            subject='Low stock',
            message='Coffee is below reorder level.',
            priority='high',
        )

        recipient_emails = {event.recipient_user.email for event in events}
        self.assertIn(tenant_admin.email, recipient_emails)
        self.assertIn(inventory_manager.email, recipient_emails)
        self.assertNotIn('frontdesk-no-notify@example.com', recipient_emails)

    def test_notification_workflow_state_can_be_acknowledged_resolved_and_reopened(self):
        user = PlatformUser.objects.create_user(email='manager-workflow@example.com', password='testpass123456')
        event = NotificationEvent.objects.create(
            channel='in_app',
            event_type='housekeeping.escalated',
            module='housekeeping',
            subject='Room escalation',
            message='Room needs maintenance follow-up.',
            priority='urgent',
        )

        event.acknowledge(user=user, notes='Maintenance informed.')
        event.refresh_from_db()
        self.assertEqual(event.workflow_status, 'acknowledged')
        self.assertEqual(event.acknowledged_by, user)
        self.assertEqual(event.follow_up_notes, 'Maintenance informed.')

        event.resolve(user=user, notes='Ticket closed.')
        event.refresh_from_db()
        self.assertEqual(event.workflow_status, 'resolved')
        self.assertEqual(event.resolved_by, user)
        self.assertEqual(event.follow_up_notes, 'Ticket closed.')

        event.reopen(notes='Issue returned.')
        event.refresh_from_db()
        self.assertEqual(event.workflow_status, 'open')
        self.assertIsNone(event.resolved_by)
        self.assertEqual(event.follow_up_notes, 'Issue returned.')

    def test_sms_delivery_fails_cleanly_when_provider_is_disabled(self):
        event = NotificationEvent.objects.create(
            channel='sms',
            event_type='inventory.low_stock',
            module='inventory',
            subject='Low stock',
            message='Coffee is low.',
            recipient_phone='9800000000',
        )

        with self.assertRaises(Exception):
            retry_notification_delivery(event)
        event.refresh_from_db()

        self.assertEqual(event.status, 'failed')
        self.assertIn('SMS delivery is disabled', event.error_message)
        self.assertEqual(event.attempts, 0)

    def test_tenant_notification_settings_mask_and_preserve_credentials(self):
        tenant = connection.tenant
        tenant.notification_settings = {
            'sms': {
                'enabled': True,
                'provider': 'twilio',
                'account_sid': 'AC123',
                'auth_token': 'super-secret',
                'from_number': '+15550000000',
            }
        }
        tenant.save(update_fields=['notification_settings'])

        data = TenantSettingsSerializer(tenant).data
        self.assertEqual(data['notification_settings']['sms']['auth_token'], '********')

        serializer = TenantSettingsSerializer(
            tenant,
            data={'notification_settings': {'sms': {'auth_token': '********', 'from_number': '+15551111111'}}},
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        tenant.refresh_from_db()

        self.assertEqual(tenant.notification_settings['sms']['auth_token'], 'super-secret')
        self.assertEqual(tenant.notification_settings['sms']['from_number'], '+15551111111')

    @patch('notifications.providers._post_form', return_value={'sid': 'SM123'})
    def test_sms_delivery_uses_tenant_twilio_credentials(self, post_form_mock):
        tenant = connection.tenant
        tenant.notification_settings = {
            'sms': {
                'enabled': True,
                'provider': 'twilio',
                'account_sid': 'AC123',
                'auth_token': 'token-123',
                'from_number': '+15550000000',
            }
        }
        tenant.save(update_fields=['notification_settings'])
        event = NotificationEvent.objects.create(
            channel='sms',
            event_type='inventory.low_stock',
            module='inventory',
            subject='Low stock',
            message='Coffee is low.',
            recipient_phone='+9779800000000',
        )

        deliver_notification(event)
        event.refresh_from_db()

        self.assertEqual(event.status, 'sent')
        self.assertEqual(event.provider, 'twilio')
        self.assertEqual(event.provider_message_id, 'SM123')
        post_form_mock.assert_called_once()
        _, payload = post_form_mock.call_args.args[:2]
        self.assertEqual(payload['To'], '+9779800000000')
        self.assertEqual(payload['From'], '+15550000000')

    @patch('notifications.providers._post_form', return_value={'sid': 'SMWHATSAPP123'})
    def test_whatsapp_delivery_prefixes_twilio_addresses(self, post_form_mock):
        tenant = connection.tenant
        tenant.notification_settings = {
            'whatsapp': {
                'enabled': True,
                'provider': 'twilio_whatsapp',
                'account_sid': 'AC123',
                'auth_token': 'token-123',
                'from_number': '+15550000000',
            }
        }
        tenant.save(update_fields=['notification_settings'])
        event = NotificationEvent.objects.create(
            channel='whatsapp',
            event_type='booking.confirmed',
            module='bookings',
            subject='Booking confirmed',
            message='Your booking is confirmed.',
            recipient_phone='+9779800000000',
        )

        deliver_notification(event)

        _, payload = post_form_mock.call_args.args[:2]
        self.assertEqual(payload['To'], 'whatsapp:+9779800000000')
        self.assertEqual(payload['From'], 'whatsapp:+15550000000')

    @patch('notifications.providers._post_form', return_value={'sid': 'SMTEST123'})
    def test_test_delivery_endpoint_creates_and_sends_event(self, post_form_mock):
        tenant = connection.tenant
        tenant.notification_settings = {
            'sms': {
                'enabled': True,
                'provider': 'twilio',
                'account_sid': 'AC123',
                'auth_token': 'token-123',
                'from_number': '+15550000000',
            }
        }
        tenant.save(update_fields=['notification_settings'])
        user = PlatformUser.objects.create_user(email='notification-admin@example.com', password='testpass123456', tenant=tenant, is_tenant_admin=True)
        request = APIRequestFactory().post(
            '/notifications/events/test-delivery/',
            {'channel': 'sms', 'recipient_phone': '+9779800000000', 'message': 'Testing provider delivery.'},
            format='json',
        )
        force_authenticate(request, user=user)
        response = NotificationEventViewSet.as_view({'post': 'test_delivery'})(request)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['status'], 'sent')
        self.assertEqual(response.data['provider_message_id'], 'SMTEST123')
        post_form_mock.assert_called_once()

    @patch('notifications.providers.send_mail')
    def test_failed_email_can_be_retried_idempotently(self, send_mail_mock):
        event = NotificationEvent.objects.create(
            channel='email',
            status='failed',
            event_type='payroll.posted',
            module='hrms',
            subject='Payroll posted',
            message='Payroll has been posted.',
            recipient_email='owner-retry@example.com',
            error_message='smtp down',
        )

        retry_notification_delivery(event)
        event.refresh_from_db()

        self.assertEqual(event.status, 'sent')
        self.assertEqual(event.provider, 'django-email')
        self.assertEqual(event.error_message, '')
        self.assertEqual(event.attempts, 1)
        send_mail_mock.assert_called_once()

        retry_notification_delivery(event)
        event.refresh_from_db()
        self.assertEqual(event.status, 'sent')
        send_mail_mock.assert_called_once()

    def test_pending_delivery_can_be_canceled_and_not_retried(self):
        event = NotificationEvent.objects.create(
            channel='email',
            event_type='booking.confirmed',
            module='bookings',
            subject='Booking confirmed',
            message='Booking has been confirmed.',
            recipient_email='guest@example.com',
        )

        cancel_notification_delivery(event, reason='Guest opted out')
        event.refresh_from_db()

        self.assertEqual(event.status, 'canceled')
        self.assertEqual(event.error_message, 'Guest opted out')

        with self.assertRaises(ValueError):
            retry_notification_delivery(event)
