from unittest.mock import patch

from django_tenants.test.cases import TenantTestCase

from notifications.models import NotificationEvent, NotificationTemplate
from notifications.services import create_notification_event, deliver_email_notification


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

    @patch('notifications.services.send_mail')
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

    @patch('notifications.services.send_mail', side_effect=RuntimeError('smtp down'))
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
