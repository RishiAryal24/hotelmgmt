from collections import defaultdict

from django.conf import settings
from django.core.mail import send_mail

from notifications.models import NotificationEvent, NotificationTemplate


class MissingTemplateValue(defaultdict):
    def __missing__(self, key):
        return '{' + key + '}'


def render_notification_template(template, context):
    values = MissingTemplateValue(str)
    values.update(context or {})
    return {
        'subject': (template.subject_template or '').format_map(values),
        'message': template.body_template.format_map(values),
    }


def create_notification_event(
    *,
    channel,
    event_type,
    module,
    subject='',
    message='',
    template=None,
    template_code='',
    context=None,
    recipient_user=None,
    recipient_email='',
    recipient_phone='',
    priority='normal',
    payload=None,
    created_by=None,
):
    if template_code and not template:
        template = NotificationTemplate.objects.filter(code=template_code, is_active=True).first()

    if template:
        rendered = render_notification_template(template, context or {})
        subject = subject or rendered['subject']
        message = message or rendered['message']
        channel = channel or template.channel

    return NotificationEvent.objects.create(
        template=template,
        channel=channel,
        event_type=event_type,
        module=module,
        subject=subject,
        message=message,
        recipient_user=recipient_user,
        recipient_email=recipient_email or getattr(recipient_user, 'email', ''),
        recipient_phone=recipient_phone,
        priority=priority,
        payload=payload or {},
        created_by=created_by,
    )


def deliver_email_notification(event):
    if event.channel != 'email':
        raise ValueError('Only email notification events can be delivered by email')
    if not event.recipient_email:
        raise ValueError('Email notification requires recipient_email')

    event.mark_sending()
    try:
        send_mail(event.subject, event.message, settings.DEFAULT_FROM_EMAIL, [event.recipient_email])
    except Exception as exc:
        event.mark_failed(exc)
        raise

    event.mark_sent(provider='django-email')
    return event
