import base64
import json
from urllib import error, parse, request

from django.conf import settings
from django.core.mail import send_mail
from django.db import connection


DEFAULT_NOTIFICATION_SETTINGS = {
    'email': {'enabled': True, 'provider': 'django_email'},
    'sms': {
        'enabled': False,
        'provider': 'twilio',
        'account_sid': '',
        'auth_token': '',
        'from_number': '',
        'status_callback_url': '',
    },
    'whatsapp': {
        'enabled': False,
        'provider': 'twilio_whatsapp',
        'account_sid': '',
        'auth_token': '',
        'from_number': '',
        'status_callback_url': '',
    },
    'in_app': {'enabled': True, 'provider': 'in_app'},
}


class NotificationProviderError(Exception):
    pass


def get_tenant_notification_settings():
    tenant = getattr(connection, 'tenant', None)
    tenant_settings = getattr(tenant, 'notification_settings', None) or {}
    merged = {}
    for channel, defaults in DEFAULT_NOTIFICATION_SETTINGS.items():
        merged[channel] = {**defaults, **tenant_settings.get(channel, {})}
    return merged


def _channel_settings(channel):
    return get_tenant_notification_settings().get(channel, {'enabled': False, 'provider': 'disabled'})


def deliver_in_app(event):
    event.mark_sending()
    event.mark_sent(provider='in-app', provider_message_id=str(event.id))
    return event


def deliver_email(event):
    channel_settings = _channel_settings('email')
    if not channel_settings.get('enabled', False):
        raise NotificationProviderError('Email delivery is disabled for this tenant.')
    if not event.recipient_email:
        raise NotificationProviderError('Email notification requires recipient_email.')

    provider = channel_settings.get('provider') or 'django_email'
    if provider != 'django_email':
        raise NotificationProviderError(f'Email provider "{provider}" is not configured.')

    event.mark_sending()
    send_mail(event.subject, event.message, settings.DEFAULT_FROM_EMAIL, [event.recipient_email])
    event.mark_sent(provider='django-email')
    return event


def _post_form(url, payload, *, username, password):
    body = parse.urlencode(payload).encode()
    token = base64.b64encode(f'{username}:{password}'.encode()).decode()
    req = request.Request(
        url,
        data=body,
        headers={
            'Authorization': f'Basic {token}',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        method='POST',
    )
    try:
        with request.urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode())
    except error.HTTPError as exc:
        detail = exc.read().decode()
        raise NotificationProviderError(f'Provider request failed: {detail}') from exc
    except error.URLError as exc:
        raise NotificationProviderError(f'Provider request failed: {exc.reason}') from exc


def _twilio_messages_url(account_sid):
    return f'https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json'


def _twilio_message_payload(event, config, *, whatsapp=False):
    to_number = event.recipient_phone
    from_number = config.get('from_number', '')
    if whatsapp:
        to_number = to_number if to_number.startswith('whatsapp:') else f'whatsapp:{to_number}'
        from_number = from_number if from_number.startswith('whatsapp:') else f'whatsapp:{from_number}'
    payload = {
        'To': to_number,
        'From': from_number,
        'Body': event.message or event.subject,
    }
    if config.get('status_callback_url'):
        payload['StatusCallback'] = config['status_callback_url']
    return payload


def deliver_twilio_message(event, channel):
    channel_settings = _channel_settings(channel)
    if not channel_settings.get('enabled', False):
        raise NotificationProviderError(f'{channel.upper()} delivery is disabled for this tenant.')

    provider = channel_settings.get('provider') or 'disabled'
    expected_provider = 'twilio_whatsapp' if channel == 'whatsapp' else 'twilio'
    if provider != expected_provider:
        raise NotificationProviderError(f'{channel.upper()} provider "{provider}" is not configured.')
    if not event.recipient_phone:
        raise NotificationProviderError(f'{channel.upper()} notification requires recipient_phone.')

    account_sid = channel_settings.get('account_sid', '')
    auth_token = channel_settings.get('auth_token', '')
    from_number = channel_settings.get('from_number', '')
    if not account_sid or not auth_token or not from_number:
        raise NotificationProviderError(f'{channel.upper()} provider credentials are incomplete.')

    event.mark_sending()
    data = _post_form(
        _twilio_messages_url(account_sid),
        _twilio_message_payload(event, channel_settings, whatsapp=channel == 'whatsapp'),
        username=account_sid,
        password=auth_token,
    )
    provider_message_id = data.get('sid') or f'{provider}:{event.id}'
    event.mark_sent(provider=provider, provider_message_id=provider_message_id)
    return event


def deliver_notification(event):
    if event.channel in ['in_app', 'system']:
        return deliver_in_app(event)
    if event.channel == 'email':
        return deliver_email(event)
    if event.channel in ['sms', 'whatsapp']:
        return deliver_twilio_message(event, event.channel)
    raise NotificationProviderError(f'Unsupported notification channel "{event.channel}".')
