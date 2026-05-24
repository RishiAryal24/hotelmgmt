from decimal import Decimal
from datetime import timedelta

from django.db import models, transaction
from django.utils import timezone

from bookings.models import Booking, DynamicPricingRule, GuestFolio, GuestFolioLine, Room


MONEY_QUANT = Decimal('0.01')


class CheckoutException(ValueError):
    def __init__(self, message, readiness=None):
        super().__init__(message)
        self.readiness = readiness or {}


TRANSFER_RATE_POLICIES = {
    'keep_rate': 'Keep original rate',
    'charge_difference': 'Charge upgrade difference',
    'complimentary_upgrade': 'Complimentary upgrade',
    'credit_downgrade': 'Credit downgrade difference',
}


def _date_range(start_date, end_date):
    current = start_date
    while current < end_date:
        yield current
        current = current + timedelta(days=1)


def _rule_matches(rule, *, room, rate_plan, stay_date, number_of_guests):
    if rule.room_type_id and rule.room_type_id != room.room_type_id:
        return False
    if rule.rate_plan_id and (not rate_plan or rule.rate_plan_id != rate_plan.id):
        return False
    if rule.valid_from > stay_date or rule.valid_to < stay_date:
        return False
    if rule.min_occupancy and number_of_guests < rule.min_occupancy:
        return False
    if rule.max_occupancy and number_of_guests > rule.max_occupancy:
        return False
    if rule.days_of_week and stay_date.weekday() not in [int(day) for day in rule.days_of_week]:
        return False
    return True


def calculate_booking_price(*, room: Room, check_in_date, check_out_date, rate_plan=None, package=None, number_of_guests: int = 1):
    if check_out_date <= check_in_date:
        raise ValueError('Checkout date must be after check-in date.')
    base_rate = Decimal(str(rate_plan.base_rate if rate_plan else room.price_per_night))
    if package:
        return {
            'nights': (check_out_date - check_in_date).days,
            'base_rate': base_rate.quantize(MONEY_QUANT),
            'total_amount': Decimal(str(package.total_price)).quantize(MONEY_QUANT),
            'package': {
                'id': str(package.id),
                'name': package.name,
                'total_price': Decimal(str(package.total_price)).quantize(MONEY_QUANT),
                'includes': package.includes,
            },
            'nightly_breakdown': [
                {
                    'date': stay_date,
                    'base_rate': base_rate.quantize(MONEY_QUANT),
                    'final_rate': Decimal('0.00'),
                    'rules': [],
                }
                for stay_date in _date_range(check_in_date, check_out_date)
            ],
        }
    rules = list(
        DynamicPricingRule.objects.filter(
            is_active=True,
            valid_from__lt=check_out_date,
            valid_to__gte=check_in_date,
        )
        .filter(models.Q(room_type__isnull=True) | models.Q(room_type=room.room_type))
        .filter(models.Q(rate_plan__isnull=True) | models.Q(rate_plan=rate_plan))
        .order_by('priority', 'created_at')
    )
    breakdown = []
    total = Decimal('0.00')
    for stay_date in _date_range(check_in_date, check_out_date):
        nightly_rate = base_rate
        applied_rules = []
        for rule in rules:
            if not _rule_matches(rule, room=room, rate_plan=rate_plan, stay_date=stay_date, number_of_guests=number_of_guests):
                continue
            adjustment = (nightly_rate * rule.value / Decimal('100.00')) if rule.value_type == 'percentage' else rule.value
            if rule.adjustment_type == 'discount':
                adjustment = -adjustment
            nightly_rate = max(Decimal('0.00'), (nightly_rate + adjustment).quantize(MONEY_QUANT))
            applied_rules.append(
                {
                    'id': str(rule.id),
                    'name': rule.name,
                    'adjustment_type': rule.adjustment_type,
                    'value_type': rule.value_type,
                    'value': rule.value,
                    'adjustment': adjustment.quantize(MONEY_QUANT),
                }
            )
        total += nightly_rate
        breakdown.append(
            {
                'date': stay_date,
                'base_rate': base_rate.quantize(MONEY_QUANT),
                'final_rate': nightly_rate.quantize(MONEY_QUANT),
                'rules': applied_rules,
            }
        )
    return {
        'nights': len(breakdown),
        'base_rate': base_rate.quantize(MONEY_QUANT),
        'total_amount': total.quantize(MONEY_QUANT),
        'package': None,
        'nightly_breakdown': breakdown,
    }


def get_package_booking_report(*, date_from=None, date_to=None):
    bookings = Booking.objects.select_related('package').all()
    if date_from:
        bookings = bookings.filter(check_in_date__gte=date_from)
    if date_to:
        bookings = bookings.filter(check_in_date__lte=date_to)

    rows_by_package = {}
    for booking in bookings:
        key = str(booking.package_id) if booking.package_id else 'no_package'
        label = booking.package.name if booking.package_id else 'No package'
        row = rows_by_package.setdefault(
            key,
            {
                'package_id': str(booking.package_id) if booking.package_id else None,
                'package_name': label,
                'bookings': 0,
                'revenue': Decimal('0.00'),
            },
        )
        row['bookings'] += 1
        row['revenue'] += booking.total_amount

    rows = sorted(rows_by_package.values(), key=lambda row: row['revenue'], reverse=True)
    return {
        'date_from': date_from,
        'date_to': date_to,
        'rows': rows,
        'totals': {
            'bookings': sum(row['bookings'] for row in rows),
            'revenue': sum((row['revenue'] for row in rows), Decimal('0.00')),
            'package_bookings': sum(row['bookings'] for row in rows if row['package_id']),
            'package_revenue': sum((row['revenue'] for row in rows if row['package_id']), Decimal('0.00')),
        },
    }


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


def ensure_room_charge_line(folio: GuestFolio):
    GuestFolioLine.objects.get_or_create(
        folio=folio,
        source_module='room_charge',
        source_id=str(folio.booking_id),
        defaults={
            'description': f'Room charge - Room {folio.booking.room.room_number} ({folio.booking.check_in_date} to {folio.booking.check_out_date})',
            'amount': folio.booking.total_amount,
        },
    )
    return folio


def get_checkout_readiness(booking: Booking):
    try:
        folio = booking.folio
    except GuestFolio.DoesNotExist:
        folio = None
    lines = list(folio.lines.all()) if folio else []
    room_charge_lines = [line for line in lines if line.source_module == 'room_charge']
    restaurant_lines = [line for line in lines if line.source_module == 'restaurant_order']
    facility_lines = [line for line in lines if line.source_module.startswith('facility_')]

    from restaurant.models import RestaurantOrder

    unresolved_orders = list(
        RestaurantOrder.objects.filter(room_booking=booking)
        .exclude(status__in=['paid', 'cancelled'])
        .order_by('created_at')[:10]
    )

    blockers = []
    warnings = []
    if booking.status != 'checked_in':
        blockers.append('Only checked-in bookings can be checked out.')
    if not folio:
        blockers.append('No guest folio is attached to this stay.')
    elif folio.status != 'open':
        blockers.append(f'Guest folio is {folio.status}; checkout requires an open folio.')
    if folio and not room_charge_lines:
        warnings.append('Room charge line is missing and will be restored before checkout.')
    if unresolved_orders:
        blockers.append('Unresolved restaurant or room-service orders must be paid, posted, or cancelled before checkout.')

    return {
        'is_ready': not blockers,
        'blockers': blockers,
        'warnings': warnings,
        'folio_id': str(folio.id) if folio else '',
        'folio_status': folio.status if folio else 'missing',
        'has_open_folio': bool(folio and folio.status == 'open'),
        'has_room_charge_line': bool(room_charge_lines),
        'room_charge_line_count': len(room_charge_lines),
        'restaurant_posting_count': len(restaurant_lines),
        'facility_posting_count': len(facility_lines),
        'unresolved_posting_count': len(unresolved_orders),
        'unresolved_postings': [
            {
                'id': str(order.id),
                'order_number': order.order_number,
                'status': order.status,
                'grand_total': str(order.grand_total),
            }
            for order in unresolved_orders
        ],
        'total_due': str(folio.grand_total if folio else booking.total_amount),
    }


def require_checkout_ready(booking: Booking):
    readiness = get_checkout_readiness(booking)
    if not readiness['is_ready']:
        raise CheckoutException(readiness['blockers'][0], readiness=readiness)
    return readiness


def calculate_room_transfer_adjustment(booking: Booking, new_room: Room, *, adjustment_policy='keep_rate', transfer_date=None):
    if adjustment_policy not in TRANSFER_RATE_POLICIES:
        raise ValueError('Invalid room transfer rate policy.')

    effective_date = transfer_date or timezone.localdate()
    if effective_date < booking.check_in_date:
        effective_date = booking.check_in_date
    if effective_date >= booking.check_out_date:
        remaining_nights = Decimal('0')
    else:
        remaining_nights = Decimal((booking.check_out_date - effective_date).days)

    old_rate = Decimal(str(booking.room.price_per_night))
    new_rate = Decimal(str(new_room.price_per_night))
    rate_difference = new_rate - old_rate
    amount = Decimal('0.00')

    if adjustment_policy == 'charge_difference' and rate_difference > 0:
        amount = rate_difference * remaining_nights
    elif adjustment_policy == 'credit_downgrade' and rate_difference < 0:
        amount = rate_difference * remaining_nights

    return {
        'policy': adjustment_policy,
        'policy_label': TRANSFER_RATE_POLICIES[adjustment_policy],
        'transfer_date': effective_date,
        'remaining_nights': int(remaining_nights),
        'old_rate': old_rate,
        'new_rate': new_rate,
        'rate_difference': rate_difference,
        'amount': amount,
    }


@transaction.atomic
def check_in_booking(booking: Booking):
    if booking.status != 'confirmed':
        raise ValueError('Only confirmed reservations can be checked in.')
    if booking.room.status not in ['available', 'occupied']:
        raise ValueError('Room is not ready for check-in.')

    has_conflict = (
        Booking.objects.filter(
            room=booking.room,
            check_in_date__lt=booking.check_out_date,
            check_out_date__gt=booking.check_in_date,
            status='checked_in',
        )
        .exclude(pk=booking.pk)
        .exists()
    )
    if has_conflict:
        raise ValueError('Room already has an in-house guest for this stay.')

    booking.status = 'checked_in'
    booking.save(update_fields=['status', 'updated_at'])

    room = booking.room
    room.status = 'occupied'
    room.save(update_fields=['status', 'updated_at'])

    folio, _ = GuestFolio.objects.get_or_create(
        booking=booking,
        defaults={
            'subtotal': booking.total_amount,
        },
    )
    ensure_room_charge_line(folio)
    return booking, folio


@transaction.atomic
def check_out_booking(booking: Booking, *, payment_method: str, paid_amount, posted_by=None, cashier_shift=None):
    require_checkout_ready(booking)
    folio = booking.folio
    ensure_room_charge_line(folio)
    folio.refresh_from_db()

    paid_amount = Decimal(str(paid_amount if paid_amount is not None else folio.grand_total))
    if paid_amount != folio.grand_total:
        raise CheckoutException('Partial hotel folio payments are not enabled yet.', readiness=get_checkout_readiness(booking))

    folio.settle(payment_method=payment_method, paid_amount=paid_amount, cashier_shift=cashier_shift)
    from accounting.services import post_room_payment

    post_room_payment(folio, posted_by=posted_by)

    booking.status = 'checked_out'
    booking.save(update_fields=['status', 'updated_at'])

    from housekeeping.services import create_checkout_cleaning_task

    create_checkout_cleaning_task(booking)
    return booking, folio


@transaction.atomic
def create_walk_in_booking(
    *,
    room: Room,
    guest,
    check_in_date,
    check_out_date,
    rate_plan=None,
    package=None,
    number_of_guests: int = 1,
    special_requests: str = '',
):
    if check_out_date <= check_in_date:
        raise ValueError('Checkout date must be after check-in date.')
    if getattr(guest, 'vip_level', '') == 'blacklist':
        raise ValueError('Guest is marked do not book.')
    if number_of_guests < 1:
        raise ValueError('Number of guests must be at least 1.')
    if number_of_guests > room.capacity:
        raise ValueError('Number of guests exceeds room capacity.')
    if room.status != 'available':
        raise ValueError('Walk-in room must be available.')

    has_conflict = (
        Booking.objects.filter(
            room=room,
            check_in_date__lt=check_out_date,
            check_out_date__gt=check_in_date,
            status__in=['confirmed', 'checked_in'],
        )
        .exists()
    )
    if has_conflict:
        raise ValueError('Room is not available for the requested stay dates.')

    booking = Booking.objects.create(
        room=room,
        guest=guest,
        rate_plan=rate_plan,
        package=package,
        check_in_date=check_in_date,
        check_out_date=check_out_date,
        number_of_guests=number_of_guests,
        status='checked_in',
        special_requests=special_requests,
    )
    room.status = 'occupied'
    room.save(update_fields=['status', 'updated_at'])
    folio = GuestFolio.objects.create(
        booking=booking,
        subtotal=booking.total_amount,
    )
    ensure_room_charge_line(folio)

    return booking, folio


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
    extension_amount = calculate_booking_price(
        room=booking.room,
        check_in_date=old_check_out_date,
        check_out_date=new_check_out_date,
        rate_plan=booking.rate_plan,
        number_of_guests=booking.number_of_guests,
    )['total_amount']

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
def transfer_booking_room(booking: Booking, new_room: Room, *, adjustment_policy='keep_rate', transfer_date=None):
    if booking.status != 'checked_in':
        raise ValueError('Only checked-in bookings can be transferred.')
    if booking.room_id == new_room.id:
        raise ValueError('Booking is already assigned to this room.')
    if new_room.status != 'available':
        raise ValueError('Target room must be available.')
    adjustment = calculate_room_transfer_adjustment(
        booking,
        new_room,
        adjustment_policy=adjustment_policy,
        transfer_date=transfer_date,
    )

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
    if adjustment['amount'] or adjustment_policy == 'complimentary_upgrade':
        GuestFolioLine.objects.create(
            folio=folio,
            source_module='room_transfer_rate_adjustment',
            source_id=f'{booking.id.hex[:12]}:{old_room.id.hex[:8]}:{new_room.id.hex[:8]}:{adjustment_policy}',
            description=(
                f"{adjustment['policy_label']} - Room {old_room.room_number} "
                f"to {new_room.room_number} for {adjustment['remaining_nights']} night(s)"
            ),
            amount=adjustment['amount'],
        )

    booking.refresh_from_db()
    folio.refresh_from_db()
    return booking, folio
