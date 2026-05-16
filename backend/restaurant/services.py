from django.db import transaction
from django.utils import timezone

from bookings.models import Booking, GuestFolio, GuestFolioLine
from restaurant.models import RestaurantOrder


class RestaurantSettlementError(Exception):
    pass


@transaction.atomic
def settle_restaurant_order(order, *, payment_method, paid_amount=None, booking_id=None, posted_by=None):
    if order.status != 'served':
        raise RestaurantSettlementError('Only served orders can be settled')

    if payment_method not in dict(RestaurantOrder.PAYMENT_METHOD_CHOICES):
        raise RestaurantSettlementError('Invalid payment method')

    room_booking = None
    if payment_method == 'room_posting':
        if not booking_id:
            raise RestaurantSettlementError('Select an active room booking for room posting')
        try:
            room_booking = Booking.objects.select_related('room', 'guest').get(id=booking_id, status='checked_in')
        except Booking.DoesNotExist as exc:
            raise RestaurantSettlementError('Room posting requires an active checked-in booking') from exc

    order.paid_amount = paid_amount or order.grand_total
    order.payment_method = payment_method
    order.paid_at = timezone.now()
    order.status = 'paid'
    order.room_booking = room_booking
    order.save(update_fields=['paid_amount', 'payment_method', 'paid_at', 'status', 'room_booking', 'updated_at'])

    if order.table:
        order.table.status = 'cleaning'
        order.table.save(update_fields=['status', 'updated_at'])

    if room_booking:
        folio, _ = GuestFolio.objects.get_or_create(
            booking=room_booking,
            defaults={
                'subtotal': room_booking.total_amount,
            },
        )
        if folio.status != 'open':
            raise RestaurantSettlementError('Cannot post charges to a closed folio')
        GuestFolioLine.objects.get_or_create(
            folio=folio,
            source_module='restaurant_order',
            source_id=str(order.id),
            defaults={
                'description': f'Restaurant order {order.order_number}',
                'amount': order.grand_total,
            },
        )

    from accounting.services import post_restaurant_settlement
    from inventory.services import deduct_restaurant_order_inventory

    deduct_restaurant_order_inventory(order, posted_by=posted_by)
    post_restaurant_settlement(order, posted_by=posted_by)
    return order
