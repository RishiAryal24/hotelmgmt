from celery import shared_task
from celery.exceptions import CeleryError
from django.conf import settings
from kombu.exceptions import KombuError

from notifications.models import NotificationEvent
from notifications.services import deliver_notification_event as deliver_event


@shared_task
def deliver_notification_event(event_id):
    event = NotificationEvent.objects.get(id=event_id)
    deliver_event(event)
    return str(event.id)


def queue_notification_delivery(event):
    if event.status == 'sent':
        return event
    if event.status == 'canceled':
        raise ValueError('Canceled notification events cannot be queued.')
    event.mark_queued()
    try:
        deliver_notification_event.delay(str(event.id))
    except (CeleryError, KombuError, OSError):
        if getattr(settings, 'DEBUG', False):
            deliver_notification_event(str(event.id))
        else:
            event.mark_failed('Notification queue is unavailable')
            raise
    return event


def retry_notification_delivery(event):
    if event.status == 'sent':
        return event
    if event.status == 'canceled':
        raise ValueError('Canceled notification events cannot be retried.')
    event.reset_for_retry()
    return queue_notification_delivery(event)


def cancel_notification_delivery(event, *, reason='Canceled by user'):
    if event.status == 'sent':
        raise ValueError('Sent notification events cannot be canceled.')
    event.mark_canceled(reason=reason)
    return event
