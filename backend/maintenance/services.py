from django.db import transaction
from django.utils import timezone

from maintenance.models import MaintenanceTicket


ACTIVE_STATUSES = ['open', 'in_progress']


def _set_room_for_ticket_state(room):
    if MaintenanceTicket.objects.filter(room=room, status__in=ACTIVE_STATUSES).exists():
        room.status = 'maintenance'
    else:
        from housekeeping.models import HousekeepingTask

        has_active_housekeeping = HousekeepingTask.objects.filter(
            room=room,
            status__in=['open', 'in_progress', 'blocked'],
        ).exists()
        room.status = 'cleaning' if has_active_housekeeping else 'available'
    room.save(update_fields=['status', 'updated_at'])


@transaction.atomic
def create_maintenance_ticket(*, room, title, description='', category='other', priority='normal', reported_by=None, assigned_to=None, due_at=None):
    ticket = MaintenanceTicket.objects.create(
        room=room,
        title=title,
        description=description,
        category=category,
        priority=priority,
        reported_by=reported_by,
        assigned_to=assigned_to,
        due_at=due_at,
    )
    room.status = 'maintenance'
    room.save(update_fields=['status', 'updated_at'])
    return ticket


@transaction.atomic
def start_maintenance_ticket(ticket):
    if ticket.status not in ['open']:
        raise ValueError('Only open tickets can be started.')
    ticket.status = 'in_progress'
    ticket.started_at = timezone.now()
    ticket.save(update_fields=['status', 'started_at', 'updated_at'])
    ticket.room.status = 'maintenance'
    ticket.room.save(update_fields=['status', 'updated_at'])
    return ticket


@transaction.atomic
def resolve_maintenance_ticket(ticket, resolution_notes=''):
    if ticket.status not in ACTIVE_STATUSES:
        raise ValueError('Only active tickets can be resolved.')
    ticket.status = 'resolved'
    ticket.resolved_at = timezone.now()
    if resolution_notes:
        ticket.resolution_notes = resolution_notes
    ticket.save(update_fields=['status', 'resolved_at', 'resolution_notes', 'updated_at'])
    _set_room_for_ticket_state(ticket.room)
    return ticket


@transaction.atomic
def close_maintenance_ticket(ticket):
    if ticket.status != 'resolved':
        raise ValueError('Only resolved tickets can be closed.')
    ticket.status = 'closed'
    ticket.closed_at = timezone.now()
    ticket.save(update_fields=['status', 'closed_at', 'updated_at'])
    _set_room_for_ticket_state(ticket.room)
    return ticket


@transaction.atomic
def cancel_maintenance_ticket(ticket):
    if ticket.status in ['closed', 'canceled']:
        raise ValueError('Ticket cannot be canceled.')
    ticket.status = 'canceled'
    ticket.save(update_fields=['status', 'updated_at'])
    _set_room_for_ticket_state(ticket.room)
    return ticket
