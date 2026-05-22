from celery import shared_task
from celery.exceptions import CeleryError
from django.core.mail import send_mail
from django.conf import settings
from kombu.exceptions import KombuError

from notifications.services import create_notification_event
from notifications.tasks import queue_notification_delivery


@shared_task
def send_booking_confirmation_email(booking_id, guest_email):
    """
    Send booking confirmation email to guest.
    """
    subject = 'Booking Confirmation'
    message = f'Your booking {booking_id} has been confirmed.'
    from_email = settings.DEFAULT_FROM_EMAIL
    send_mail(subject, message, from_email, [guest_email])


def queue_booking_confirmation_email(booking_id, guest_email):
    event = create_notification_event(
        channel='email',
        event_type='booking.confirmation',
        module='bookings',
        subject='Booking Confirmation',
        message=f'Your booking {booking_id} has been confirmed.',
        recipient_email=guest_email,
        payload={'booking_id': str(booking_id)},
    )
    try:
        queue_notification_delivery(event)
    except (CeleryError, KombuError, OSError):
        if getattr(settings, 'DEBUG', False):
            send_booking_confirmation_email(booking_id, guest_email)
        else:
            event.mark_failed('Booking confirmation queue is unavailable')
