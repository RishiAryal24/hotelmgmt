from collections import defaultdict

from django.db import connection, models

from notifications.models import NotificationEvent, NotificationTemplate
from notifications.providers import deliver_notification
from users.models import PlatformUser


MANAGER_ROLE_CODES = {
    'hotel_admin',
    'restaurant_manager',
    'inventory_manager',
    'hr_officer',
    'accountant',
    'maintenance',
    'auditor',
}

MODULE_MANAGER_ROLE_CODES = {
    'bookings': {'hotel_admin', 'receptionist'},
    'inventory': {'hotel_admin', 'inventory_manager'},
    'hrms': {'hotel_admin', 'hr_officer', 'accountant'},
    'housekeeping': {'hotel_admin', 'maintenance'},
    'integrations': {'hotel_admin', 'receptionist', 'auditor'},
}


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


def get_notification_recipients(module=''):
    role_codes = MODULE_MANAGER_ROLE_CODES.get(module, MANAGER_ROLE_CODES)
    recipients = PlatformUser.objects.filter(is_active=True)
    tenant = getattr(connection, 'tenant', None)
    if tenant and getattr(tenant, 'schema_name', 'public') != 'public':
        recipients = recipients.filter(models.Q(tenant=tenant) | models.Q(is_platform_admin=True))
    recipients = recipients.filter(
        models.Q(is_tenant_admin=True) | models.Q(roles__code__in=role_codes),
    ).distinct()
    return list(recipients)


def create_manager_notification_events(*, module, **kwargs):
    recipients = get_notification_recipients(module)
    if not recipients:
        return [create_notification_event(module=module, **kwargs)]
    return [
        create_notification_event(module=module, recipient_user=recipient, **kwargs)
        for recipient in recipients
    ]


def create_low_stock_notification(item, *, created_by=None, source='inventory'):
    current_stock = item.current_stock
    events = create_manager_notification_events(
        channel='in_app',
        event_type='inventory.low_stock',
        module='inventory',
        subject=f'Low stock: {item.name}',
        message=f'{item.name} is at {current_stock} {item.unit}; reorder level is {item.reorder_level} {item.unit}.',
        priority='high',
        payload={
            'item_id': str(item.id),
            'sku': item.sku,
            'name': item.name,
            'unit': item.unit,
            'current_stock': str(current_stock),
            'reorder_level': str(item.reorder_level),
            'source': source,
        },
        created_by=created_by,
    )
    return events[0]


def create_payroll_posted_notification(payroll_run, *, created_by=None):
    events = create_manager_notification_events(
        channel='in_app',
        event_type='payroll.posted',
        module='hrms',
        subject=f'Payroll posted: {payroll_run.period.name}',
        message=f'Payroll for {payroll_run.period.name} was posted with net pay {payroll_run.total_net_pay}.',
        priority='normal',
        payload={
            'payroll_run_id': str(payroll_run.id),
            'period_id': str(payroll_run.period_id),
            'period_name': payroll_run.period.name,
            'total_net_pay': str(payroll_run.total_net_pay),
            'journal_entry_id': str(payroll_run.journal_entry_id) if payroll_run.journal_entry_id else '',
        },
        created_by=created_by,
    )
    return events[0]


def create_housekeeping_escalation_notification(task, ticket, *, created_by=None):
    events = create_manager_notification_events(
        channel='in_app',
        event_type='housekeeping.escalated',
        module='housekeeping',
        subject=f'Housekeeping escalation: Room {task.room.room_number}',
        message=f'Room {task.room.room_number} was escalated to maintenance: {ticket.title}.',
        priority='urgent',
        payload={
            'task_id': str(task.id),
            'ticket_id': str(ticket.id),
            'room_id': str(task.room_id),
            'room_number': task.room.room_number,
            'priority': task.priority,
        },
        created_by=created_by,
    )
    return events[0]


def create_ota_reservation_review_notification(reservation_import, *, created_by=None):
    conflict = reservation_import.conflict_type.replace('_', ' ')
    events = create_manager_notification_events(
        channel='in_app',
        event_type='ota.reservation_review',
        module='integrations',
        subject=f'OTA reservation needs review: {reservation_import.external_reservation_id}',
        message=f'{reservation_import.channel.name} reservation {reservation_import.external_reservation_id} needs review ({conflict}).',
        priority='high' if reservation_import.status == 'conflict' else 'normal',
        payload={
            'reservation_import_id': reservation_import.id,
            'channel_id': reservation_import.channel_id,
            'channel_name': reservation_import.channel.name,
            'external_reservation_id': reservation_import.external_reservation_id,
            'status': reservation_import.status,
            'conflict_type': reservation_import.conflict_type,
            'conflict_message': reservation_import.conflict_message,
            'check_in_date': str(reservation_import.check_in_date or ''),
            'check_out_date': str(reservation_import.check_out_date or ''),
            'guest_email': reservation_import.guest_email,
        },
        created_by=created_by,
    )
    return events[0]


def create_ota_reservation_reviewed_notification(reservation_import, *, action, created_by=None):
    events = create_manager_notification_events(
        channel='in_app',
        event_type=f'ota.reservation_{action}',
        module='integrations',
        subject=f'OTA reservation {action}: {reservation_import.external_reservation_id}',
        message=f'{reservation_import.channel.name} reservation {reservation_import.external_reservation_id} was {action}.',
        priority='normal',
        payload={
            'reservation_import_id': reservation_import.id,
            'booking_id': str(reservation_import.booking_id or ''),
            'channel_id': reservation_import.channel_id,
            'channel_name': reservation_import.channel.name,
            'external_reservation_id': reservation_import.external_reservation_id,
            'status': reservation_import.status,
            'action': action,
        },
        created_by=created_by,
    )
    return events[0]


def deliver_notification_event(event):
    if event.status == 'sent':
        return event
    if event.status == 'canceled':
        raise ValueError('Canceled notification events cannot be delivered.')
    try:
        return deliver_notification(event)
    except Exception as exc:
        event.mark_failed(exc)
        raise


def deliver_email_notification(event):
    if event.channel != 'email':
        raise ValueError('Only email notification events can be delivered by email')
    return deliver_notification_event(event)
