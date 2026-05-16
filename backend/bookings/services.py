from decimal import Decimal

from django.db import transaction

from bookings.models import Booking, GuestFolio, GuestFolioLine, Room


def get_guest_history(guest):
    bookings = (
        Booking.objects.filter(guest=guest)
        .select_related('room', 'room__room_type', 'guest')
        .prefetch_related('folio__lines')
        .order_by('-check_in_date')
    )
    folios = (
        GuestFolio.objects.filter(booking__guest=guest)
        .select_related('booking', 'booking__guest', 'booking__room')
        .prefetch_related('lines')
        .order_by('-created_at')
    )
    paid_folios = [folio for folio in folios if folio.status == 'paid']
    lifetime_value = sum((folio.paid_amount or folio.grand_total for folio in paid_folios), Decimal('0.00'))
    active_bookings = [booking for booking in bookings if booking.status in ['confirmed', 'checked_in']]
    completed_bookings = [booking for booking in bookings if booking.status == 'checked_out']

    return {
        'summary': {
            'total_bookings': bookings.count(),
            'completed_stays': len(completed_bookings),
            'active_bookings': len(active_bookings),
            'canceled_bookings': len([booking for booking in bookings if booking.status == 'cancelled']),
            'open_folios': len([folio for folio in folios if folio.status == 'open']),
            'lifetime_value': lifetime_value,
            'last_stay': completed_bookings[0].check_out_date if completed_bookings else None,
            'next_arrival': active_bookings[-1].check_in_date if active_bookings else None,
        },
        'bookings': list(bookings),
        'folios': list(folios),
    }


@transaction.atomic
def extend_booking_stay(booking: Booking, new_check_out_date):
    if booking.status != 'checked_in':
        raise ValueError('Only checked-in bookings can be extended.')
    if new_check_out_date <= booking.check_out_date:
        raise ValueError('New checkout date must be after the current checkout date.')

    has_conflict = (
        Booking.objects.filter(
            room=booking.room,
            check_in_date__lt=new_check_out_date,
            check_out_date__gt=booking.check_out_date,
            status__in=['confirmed', 'checked_in'],
        )
        .exclude(pk=booking.pk)
        .exists()
    )
    if has_conflict:
        raise ValueError('Room is not available for the requested extension dates.')

    old_check_out_date = booking.check_out_date
    old_total = booking.total_amount
    extension_nights = Decimal((new_check_out_date - old_check_out_date).days)
    extension_amount = extension_nights * Decimal(str(booking.room.price_per_night))

    folio, _ = GuestFolio.objects.get_or_create(
        booking=booking,
        defaults={
            'subtotal': old_total,
        },
    )
    if folio.status != 'open':
        raise ValueError('Only open folios can be extended.')

    booking.check_out_date = new_check_out_date
    booking.save(update_fields=['check_out_date', 'total_amount', 'updated_at'])

    GuestFolioLine.objects.create(
        folio=folio,
        source_module='booking_extension',
        source_id=f'{booking.id}:{old_check_out_date}:{new_check_out_date}',
        description=f'Stay extension {old_check_out_date} to {new_check_out_date}',
        amount=extension_amount,
    )
    folio.refresh_from_db()

    return booking, folio


@transaction.atomic
def modify_confirmed_booking(
    booking: Booking,
    *,
    room: Room | None = None,
    check_in_date=None,
    check_out_date=None,
    number_of_guests=None,
    special_requests=None,
):
    if booking.status != 'confirmed':
        raise ValueError('Only confirmed reservations can be modified before check-in.')

    next_room = room or booking.room
    next_check_in_date = check_in_date or booking.check_in_date
    next_check_out_date = check_out_date or booking.check_out_date

    if next_check_out_date <= next_check_in_date:
        raise ValueError('Checkout date must be after check-in date.')
    if next_room.status == 'maintenance':
        raise ValueError('Target room is unavailable for maintenance.')

    has_conflict = (
        Booking.objects.filter(
            room=next_room,
            check_in_date__lt=next_check_out_date,
            check_out_date__gt=next_check_in_date,
            status__in=['confirmed', 'checked_in'],
        )
        .exclude(pk=booking.pk)
        .exists()
    )
    if has_conflict:
        raise ValueError('Target room is not available for the requested stay dates.')

    booking.room = next_room
    booking.check_in_date = next_check_in_date
    booking.check_out_date = next_check_out_date
    if number_of_guests is not None:
        booking.number_of_guests = number_of_guests
    if special_requests is not None:
        booking.special_requests = special_requests
    booking.save()
    return booking


@transaction.atomic
def transfer_booking_room(booking: Booking, new_room: Room):
    if booking.status != 'checked_in':
        raise ValueError('Only checked-in bookings can be transferred.')
    if booking.room_id == new_room.id:
        raise ValueError('Booking is already assigned to this room.')
    if new_room.status != 'available':
        raise ValueError('Target room must be available.')

    has_conflict = (
        Booking.objects.filter(
            room=new_room,
            check_in_date__lt=booking.check_out_date,
            check_out_date__gt=booking.check_in_date,
            status__in=['confirmed', 'checked_in'],
        )
        .exclude(pk=booking.pk)
        .exists()
    )
    if has_conflict:
        raise ValueError('Target room is not available for this stay.')

    old_room = booking.room
    folio, _ = GuestFolio.objects.get_or_create(
        booking=booking,
        defaults={
            'subtotal': booking.total_amount,
        },
    )
    if folio.status != 'open':
        raise ValueError('Only open folios can be transferred.')

    Booking.objects.filter(pk=booking.pk).update(room=new_room)
    old_room.status = 'cleaning'
    old_room.save(update_fields=['status', 'updated_at'])
    new_room.status = 'occupied'
    new_room.save(update_fields=['status', 'updated_at'])

    from housekeeping.models import HousekeepingTask

    HousekeepingTask.objects.get_or_create(
        room=old_room,
        status='open',
        task_type='stayover_clean',
        defaults={
            'priority': 'normal',
            'notes': f'Room transfer cleaning for booking {booking.id}',
        },
    )
    GuestFolioLine.objects.create(
        folio=folio,
        source_module='room_transfer',
        source_id=f'{booking.id.hex[:12]}:{old_room.id.hex[:8]}:{new_room.id.hex[:8]}',
        description=f'Room transfer from {old_room.room_number} to {new_room.room_number}',
        amount=Decimal('0.00'),
    )

    booking.refresh_from_db()
    folio.refresh_from_db()
    return booking, folio
