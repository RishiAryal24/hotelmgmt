from datetime import datetime, time, timedelta

from django.db import IntegrityError
from django.utils import timezone

from bookings.models import Booking, GuestFollowUpReminder, GuestFolio
from notifications.services import create_manager_notification_events


def _aware_due(date_value, hour=9):
    return timezone.make_aware(datetime.combine(date_value, time(hour, 0)))


def create_guest_follow_up_reminder(
    *,
    guest,
    booking=None,
    reminder_type='custom',
    subject,
    message='',
    due_at,
    priority='normal',
    assigned_to=None,
    created_by=None,
    notify=True,
):
    reminder = GuestFollowUpReminder.objects.filter(
        guest=guest,
        booking=booking,
        reminder_type=reminder_type,
        subject=subject,
        status__in=['open', 'snoozed'],
    ).first()
    created = reminder is None
    if created:
        try:
            reminder = GuestFollowUpReminder.objects.create(
                guest=guest,
                booking=booking,
                reminder_type=reminder_type,
                subject=subject,
                message=message,
                due_at=due_at,
                priority=priority,
                assigned_to=assigned_to,
                created_by=created_by,
            )
        except IntegrityError:
            reminder = GuestFollowUpReminder.objects.filter(
                guest=guest,
                booking=booking,
                reminder_type=reminder_type,
                subject=subject,
                status__in=['open', 'snoozed'],
            ).first()
            created = False
    else:
        reminder.message = message or reminder.message
        reminder.due_at = due_at
        reminder.priority = priority
        reminder.save(
            update_fields=['message', 'due_at', 'priority', 'updated_at'],
        )

    if created and notify:
        create_manager_notification_events(
            channel='in_app',
            event_type='guest.follow_up_due',
            module='bookings',
            subject=subject,
            message=message or f'Follow up with {guest}.',
            priority=priority,
            payload={
                'reminder_id': str(reminder.id),
                'guest_id': str(guest.id),
                'booking_id': str(booking.id) if booking else '',
                'reminder_type': reminder_type,
                'due_at': reminder.due_at.isoformat(),
            },
            created_by=created_by,
        )
    return reminder


def create_booking_follow_up_reminders(booking: Booking, *, created_by=None):
    reminders = []
    arrival_due = _aware_due(booking.check_in_date - timedelta(days=1), hour=10)
    reminders.append(
        create_guest_follow_up_reminder(
            guest=booking.guest,
            booking=booking,
            reminder_type='arrival',
            subject=f'Arrival follow-up: {booking.guest}',
            message=f'Confirm arrival details for Room {booking.room.room_number} on {booking.check_in_date}.',
            due_at=arrival_due,
            priority='normal',
            created_by=created_by,
        ),
    )
    if booking.guest.vip_level == 'vip':
        reminders.append(
            create_guest_follow_up_reminder(
                guest=booking.guest,
                booking=booking,
                reminder_type='vip',
                subject=f'VIP guest follow-up: {booking.guest}',
                message=f'Review VIP preferences and arrival notes for {booking.guest}.',
                due_at=arrival_due,
                priority='high',
                created_by=created_by,
            ),
        )
    return reminders


def create_post_stay_follow_up(booking: Booking, *, created_by=None):
    return create_guest_follow_up_reminder(
        guest=booking.guest,
        booking=booking,
        reminder_type='post_stay',
        subject=f'Post-stay follow-up: {booking.guest}',
        message=f'Follow up after checkout from Room {booking.room.room_number}.',
        due_at=timezone.now() + timedelta(days=1),
        priority='normal',
        created_by=created_by,
    )


def create_open_folio_follow_up(folio: GuestFolio, *, created_by=None):
    return create_guest_follow_up_reminder(
        guest=folio.booking.guest,
        booking=folio.booking,
        reminder_type='payment',
        subject=f'Pending payment follow-up: {folio.booking.guest}',
        message=f'Open folio {folio.folio_number} has a balance of {folio.grand_total}.',
        due_at=timezone.now() + timedelta(hours=2),
        priority='high',
        created_by=created_by,
    )
