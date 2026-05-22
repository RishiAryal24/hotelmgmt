from celery import shared_task
from celery.exceptions import CeleryError
from django.conf import settings
from kombu.exceptions import KombuError

from notifications.models import NotificationEvent
from notifications.services import deliver_email_notification


@shared_task
def deliver_notification_event(event_id):
    event = NotificationEvent.objects.get(id=event_id)
    if event.channel == 'email':
        deliver_email_notification(event)
    return str(event.id)


def queue_notification_delivery(event):
    event.mark_queued()
    try:
        deliver_notification_event.delay(str(event.id))
    except (CeleryError, KombuError, OSError):
        if getattr(settings, 'DEBUG', False):
            deliver_notification_event(str(event.id))
        else:
            event.mark_failed('Notification queue is unavailable')
            raise
