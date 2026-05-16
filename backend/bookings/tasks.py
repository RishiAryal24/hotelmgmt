from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings


@shared_task
def send_booking_confirmation_email(booking_id, guest_email):
    """
    Send booking confirmation email to guest.
    """
    subject = 'Booking Confirmation'
    message = f'Your booking {booking_id} has been confirmed.'
    from_email = settings.DEFAULT_FROM_EMAIL
    send_mail(subject, message, from_email, [guest_email])