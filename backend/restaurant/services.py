from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db import transaction
from django.utils import timezone

from bookings.models import Booking, GuestFolio, GuestFolioLine
from restaurant.models import CashierCounter, CashierShift, RestaurantOrder, RestaurantOrderApproval, RestaurantOrderLine, RestaurantOrderPayment, RestaurantReceiptReprint, RestaurantTable


class RestaurantSettlementError(Exception):
    pass


class RestaurantOrderActionError(Exception):
    pass


class CashierShiftError(Exception):
    pass


ACTIVE_ORDER_STATUSES = ['draft', 'sent_to_kitchen', 'preparing', 'served']
APPROVAL_ACTION_STATUSES = ['draft', 'sent_to_kitchen', 'preparing', 'served']


def _next_receipt_number(paid_at):
    business_date = timezone.localtime(paid_at).date()
    prefix = f'RCP-{business_date:%Y%m%d}-'
    last_receipt = (
        RestaurantOrder.objects.select_for_update()
        .filter(receipt_number__startswith=prefix)
        .order_by('-receipt_number')
        .values_list('receipt_number', flat=True)
        .first()
    )
    next_sequence = 1
    if last_receipt:
        try:
            next_sequence = int(last_receipt.rsplit('-', 1)[1]) + 1
        except (IndexError, ValueError):
            next_sequence = RestaurantOrder.objects.filter(receipt_number__startswith=prefix).count() + 1
    return f'{prefix}{next_sequence:04d}'


def _ensure_restaurant_receipt(order):
    if order.receipt_number:
        return
    order.receipt_number = _next_receipt_number(order.paid_at or timezone.now())
    order.receipt_issued_at = order.paid_at or timezone.now()


def get_order_active_total(order):
    return sum((line.line_total for line in order.lines.exclude(status='cancelled')), Decimal('0.00'))


def get_order_active_charge_total(order):
    order.recalculate_totals()
    return order.subtotal + order.tax_total + order.service_charge_total


@transaction.atomic
def get_open_cashier_shift(*, cashier, cashier_shift_id=None):
    queryset = CashierShift.objects.filter(cashier=cashier, status='open')
    if cashier_shift_id:
        return queryset.get(id=cashier_shift_id)
    return queryset.first()


@transaction.atomic
def settle_restaurant_order(order, *, payment_method=None, paid_amount=None, booking_id=None, posted_by=None, cashier_shift=None, payments=None):
    if order.status != 'served':
        raise RestaurantSettlementError('Only served orders can be settled')

    payment_rows = []
    if payments:
        for payment in payments:
            method = payment.get('payment_method')
            amount = Decimal(str(payment.get('amount') or 0))
            if method not in dict(RestaurantOrder.PAYMENT_METHOD_CHOICES) or method in ['split', 'room_posting']:
                raise RestaurantSettlementError('Invalid split payment method')
            if amount <= 0:
                raise RestaurantSettlementError('Split payment amounts must be greater than zero')
            payment_rows.append({'payment_method': method, 'amount': amount})
        if sum((payment['amount'] for payment in payment_rows), Decimal('0.00')) != order.grand_total:
            raise RestaurantSettlementError('Split payments must equal the order total')
        payment_method = 'split' if len(payment_rows) > 1 else payment_rows[0]['payment_method']
        paid_amount = order.grand_total
    else:
        if payment_method not in dict(RestaurantOrder.PAYMENT_METHOD_CHOICES) or payment_method == 'split':
            raise RestaurantSettlementError('Invalid payment method')
        paid_amount = Decimal(str(paid_amount or order.grand_total))
        payment_rows = [{'payment_method': payment_method, 'amount': paid_amount}]

    room_booking = None
    if payment_method == 'room_posting':
        if not booking_id:
            raise RestaurantSettlementError('Select an active room booking for room posting')
        try:
            room_booking = Booking.objects.select_related('room', 'guest').get(id=booking_id, status='checked_in')
        except Booking.DoesNotExist as exc:
            raise RestaurantSettlementError('Room posting requires an active checked-in booking') from exc

    order.paid_amount = paid_amount
    order.payment_method = payment_method
    order.paid_at = timezone.now()
    order.status = 'paid'
    order.room_booking = room_booking
    order.cashier_shift = cashier_shift
    _ensure_restaurant_receipt(order)
    order.save(update_fields=['paid_amount', 'payment_method', 'paid_at', 'status', 'room_booking', 'cashier_shift', 'receipt_number', 'receipt_issued_at', 'updated_at'])
    order.payments.all().delete()
    for payment in payment_rows:
        RestaurantOrderPayment.objects.create(
            order=order,
            payment_method=payment['payment_method'],
            amount=payment['amount'],
            cashier_shift=cashier_shift,
            paid_at=order.paid_at,
        )

    if order.table:
        order.table.status = 'cleaning'
        order.table.save(update_fields=['status', 'updated_at'])

    if room_booking:
        from bookings.services import ensure_room_charge_line

        folio, _ = GuestFolio.objects.get_or_create(
            booking=room_booking,
            defaults={
                'subtotal': room_booking.total_amount,
            },
        )
        ensure_room_charge_line(folio)
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


@transaction.atomic
def record_restaurant_receipt_reprint(order, *, reprinted_by=None, cashier_shift=None, reason=''):
    if order.status != 'paid':
        raise RestaurantSettlementError('Only paid restaurant receipts can be reprinted')
    _ensure_restaurant_receipt(order)
    order.receipt_reprint_count += 1
    order.save(update_fields=['receipt_number', 'receipt_issued_at', 'receipt_reprint_count', 'updated_at'])
    return RestaurantReceiptReprint.objects.create(
        order=order,
        receipt_number=order.receipt_number,
        reprinted_by=reprinted_by,
        cashier_shift=cashier_shift or order.cashier_shift,
        reason=reason,
    )


def update_table_status_after_order_move(table):
    if not table:
        return
    has_active_orders = table.orders.filter(status__in=ACTIVE_ORDER_STATUSES).exists()
    table.status = 'occupied' if has_active_orders else 'available'
    table.save(update_fields=['status', 'updated_at'])


@transaction.atomic
def transfer_order_table(order, target_table):
    if order.order_type != 'dine_in':
        raise RestaurantOrderActionError('Only dine-in orders can be transferred between tables.')
    if order.status not in ACTIVE_ORDER_STATUSES:
        raise RestaurantOrderActionError('Only active orders can be transferred.')
    if not target_table.is_active or target_table.status not in ['available', 'reserved']:
        raise RestaurantOrderActionError('Target table is not available.')
    if order.table_id == target_table.id:
        raise RestaurantOrderActionError('Select a different target table.')

    previous_table = order.table
    order.table = target_table
    order.save(update_fields=['table', 'updated_at'])

    target_table.status = 'occupied'
    target_table.save(update_fields=['status', 'updated_at'])
    update_table_status_after_order_move(previous_table)
    return order


@transaction.atomic
def merge_order_table(source_order, target_order):
    if source_order.id == target_order.id:
        raise RestaurantOrderActionError('Select a different target order.')
    if source_order.order_type != 'dine_in' or target_order.order_type != 'dine_in':
        raise RestaurantOrderActionError('Only dine-in orders can be merged.')
    if source_order.status not in ACTIVE_ORDER_STATUSES or target_order.status not in ACTIVE_ORDER_STATUSES:
        raise RestaurantOrderActionError('Only active orders can be merged.')
    if not target_order.table_id:
        raise RestaurantOrderActionError('Target order must be assigned to a table.')

    source_table = source_order.table
    lines = list(source_order.lines.exclude(status='cancelled').prefetch_related('modifiers'))
    if not lines:
        raise RestaurantOrderActionError('Source order has no active items to merge.')

    for line in lines:
        line.order = target_order
        line.save(update_fields=['order', 'updated_at'])

    source_order.status = 'cancelled'
    source_order.notes = f'{source_order.notes}\nMerged into {target_order.order_number}'.strip()
    source_order.save(update_fields=['status', 'notes', 'updated_at'])
    source_order.recalculate_totals()

    target_order.notes = f'{target_order.notes}\nMerged from {source_order.order_number}'.strip()
    target_order.save(update_fields=['notes', 'updated_at'])
    target_order.recalculate_totals()
    update_table_status_after_order_move(source_table)
    return target_order


@transaction.atomic
def split_order_bill(order, line_splits):
    if order.status not in ['draft', 'served']:
        raise RestaurantOrderActionError('Only draft or served orders can be split.')
    if order.status in ['paid', 'cancelled']:
        raise RestaurantOrderActionError('Paid or cancelled orders cannot be split.')
    if not line_splits:
        raise RestaurantOrderActionError('Select at least one item to split.')

    split_by_line_id = {}
    for split in line_splits:
        line_id = str(split.get('line') or '')
        quantity = int(split.get('quantity') or 0)
        if not line_id or quantity <= 0:
            raise RestaurantOrderActionError('Each split item needs a valid quantity.')
        split_by_line_id[line_id] = split_by_line_id.get(line_id, 0) + quantity

    source_lines = list(order.lines.select_related('menu_item').all())
    source_by_id = {str(line.id): line for line in source_lines}

    for line_id, quantity in split_by_line_id.items():
        line = source_by_id.get(line_id)
        if not line:
            raise RestaurantOrderActionError('Selected item does not belong to this order.')
        if quantity > line.quantity:
            raise RestaurantOrderActionError('Split quantity cannot exceed the order item quantity.')

    remaining_quantity = sum(
        line.quantity - split_by_line_id.get(str(line.id), 0)
        for line in source_lines
    )
    if remaining_quantity <= 0:
        raise RestaurantOrderActionError('A split bill must leave at least one item on the original order.')

    split_order = RestaurantOrder.objects.create(
        table=order.table,
        room_booking=order.room_booking,
        order_type=order.order_type,
        status=order.status,
        waiter=order.waiter,
        tax_total=0,
        service_charge_total=0,
        discount_total=0,
        notes=f'Split from {order.order_number}',
    )

    for line_id, quantity in split_by_line_id.items():
        line = source_by_id[line_id]
        if quantity == line.quantity:
            line.order = split_order
            line.save(update_fields=['order', 'updated_at'])
        else:
            line.quantity -= quantity
            line.save(update_fields=['quantity', 'line_total', 'updated_at'])
            split_line = RestaurantOrderLine.objects.create(
                order=split_order,
                menu_item=line.menu_item,
                quantity=quantity,
                unit_price=line.unit_price,
                notes=line.notes,
                status=line.status,
            )
            split_line.modifiers.set(line.modifiers.all())
            split_line.save(update_fields=['line_total', 'updated_at'])

    order.recalculate_totals()
    split_order.recalculate_totals()
    return split_order


@transaction.atomic
def request_order_approval(order, *, action_type, requested_by=None, line=None, discount_amount=0, reason=''):
    if action_type not in dict(RestaurantOrderApproval.ACTION_CHOICES):
        raise RestaurantOrderActionError('Invalid approval action.')
    if order.status not in APPROVAL_ACTION_STATUSES:
        raise RestaurantOrderActionError('Only active orders can request approval.')

    discount = Decimal(str(discount_amount or 0))
    if action_type == 'void_line':
        if not line:
            raise RestaurantOrderActionError('Select an item to void.')
        if line.order_id != order.id:
            raise RestaurantOrderActionError('Selected item does not belong to this order.')
        if line.status == 'cancelled':
            raise RestaurantOrderActionError('This item is already voided.')
        existing = RestaurantOrderApproval.objects.filter(order=order, line=line, action_type='void_line', status='pending').first()
    elif action_type == 'discount':
        if discount <= 0:
            raise RestaurantOrderActionError('Discount amount must be greater than zero.')
        if discount > get_order_active_charge_total(order):
            raise RestaurantOrderActionError('Discount cannot exceed the order total.')
        existing = None
    else:
        active_total = get_order_active_charge_total(order)
        if active_total <= 0:
            raise RestaurantOrderActionError('Complimentary approval requires a positive order total.')
        discount = active_total
        existing = RestaurantOrderApproval.objects.filter(order=order, action_type='complimentary', status='pending').first()

    if existing:
        return existing

    return RestaurantOrderApproval.objects.create(
        order=order,
        line=line if action_type == 'void_line' else None,
        action_type=action_type,
        discount_amount=discount,
        reason=reason,
        requested_by=requested_by,
    )


@transaction.atomic
def approve_order_approval(approval, *, decided_by=None, decision_notes=''):
    if approval.status != 'pending':
        raise RestaurantOrderActionError('Only pending approvals can be approved.')

    order = approval.order
    if approval.action_type == 'void_line':
        if not approval.line_id:
            raise RestaurantOrderActionError('Approval has no item to void.')
        void_order_line(order, approval.line, reason=approval.reason)
    elif approval.action_type == 'discount':
        apply_order_discount(order, discount_amount=approval.discount_amount, reason=approval.reason)
    elif approval.action_type == 'complimentary':
        active_total = get_order_active_charge_total(order)
        apply_order_discount(order, discount_amount=active_total, reason=approval.reason or 'Complimentary bill')
    else:
        raise RestaurantOrderActionError('Invalid approval action.')

    approval.status = 'approved'
    approval.decided_by = decided_by
    approval.decided_at = timezone.now()
    approval.decision_notes = decision_notes
    approval.save(update_fields=['status', 'decided_by', 'decided_at', 'decision_notes', 'updated_at'])
    return approval


@transaction.atomic
def reject_order_approval(approval, *, decided_by=None, decision_notes=''):
    if approval.status != 'pending':
        raise RestaurantOrderActionError('Only pending approvals can be rejected.')
    approval.status = 'rejected'
    approval.decided_by = decided_by
    approval.decided_at = timezone.now()
    approval.decision_notes = decision_notes
    approval.save(update_fields=['status', 'decided_by', 'decided_at', 'decision_notes', 'updated_at'])
    return approval


@transaction.atomic
def void_order_line(order, line, *, reason=''):
    if order.status in ['paid', 'cancelled']:
        raise RestaurantOrderActionError('Paid or cancelled orders cannot be changed.')
    if line.order_id != order.id:
        raise RestaurantOrderActionError('Selected item does not belong to this order.')
    if line.status == 'cancelled':
        raise RestaurantOrderActionError('This item is already voided.')

    line.status = 'cancelled'
    note_suffix = f'Void reason: {reason}' if reason else 'Voided'
    line.notes = f'{line.notes}\n{note_suffix}'.strip()
    line.save(update_fields=['status', 'notes', 'line_total', 'updated_at'])
    line.ticket_lines.update(status='cancelled')
    order.recalculate_totals()
    return order


@transaction.atomic
def apply_order_discount(order, *, discount_amount, reason=''):
    if order.status in ['paid', 'cancelled']:
        raise RestaurantOrderActionError('Paid or cancelled orders cannot be discounted.')

    discount = Decimal(str(discount_amount or 0))
    if discount < 0:
        raise RestaurantOrderActionError('Discount cannot be negative.')

    order.discount_total = Decimal('0.00')
    order.recalculate_totals()
    subtotal = order.subtotal
    max_discount = subtotal + order.tax_total + order.service_charge_total
    if discount > max_discount:
        raise RestaurantOrderActionError('Discount cannot exceed the order total.')

    order.discount_total = discount
    order.grand_total = subtotal + order.tax_total + order.service_charge_total - discount
    if reason:
        order.notes = f'{order.notes}\nDiscount reason: {reason}'.strip()
        order.save(update_fields=['subtotal', 'discount_total', 'grand_total', 'notes', 'updated_at'])
    else:
        order.save(update_fields=['subtotal', 'discount_total', 'grand_total', 'updated_at'])
    return order


def _sum_payments(queryset):
    return queryset.aggregate(total=Sum('paid_amount'))['total'] or Decimal('0.00')


def _sum_order_payments(queryset):
    return queryset.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')


def _payment_total_row(method, label, restaurant_payments, folios):
    restaurant_total = _sum_order_payments(restaurant_payments.filter(payment_method=method))
    folio_total = _sum_payments(folios.filter(payment_method=method))
    return {
        'payment_method': method,
        'label': label,
        'restaurant_total': restaurant_total,
        'folio_total': folio_total,
        'total': restaurant_total + folio_total,
    }


def _reconciliation_amounts(shift):
    actual_by_method = {
        'cash': shift.actual_cash,
        'card': shift.actual_card,
        'wallet': shift.actual_wallet,
        'bank_transfer': shift.actual_bank_transfer,
        'room_posting': shift.actual_room_posting,
    }
    variance_by_method = {
        'cash': shift.cash_variance,
        'card': shift.card_variance,
        'wallet': shift.wallet_variance,
        'bank_transfer': shift.bank_transfer_variance,
        'room_posting': shift.room_posting_variance,
    }
    return actual_by_method, variance_by_method


def _cashier_shift_payment_rows(restaurant_orders, folios):
    from payments.services import get_settled_payment_reference

    restaurant_rows = []
    for payment in RestaurantOrderPayment.objects.filter(order__in=restaurant_orders).select_related('order', 'order__table', 'order__room_booking', 'order__room_booking__room').order_by('paid_at', 'created_at'):
        payment_reference = get_settled_payment_reference(source_module='restaurant_order', source_id=payment.order_id) or {}
        restaurant_rows.append(
            {
            'source': 'restaurant',
            'reference': payment.order.receipt_number or payment.order.order_number,
            'provider_reference': payment_reference.get('provider_reference', ''),
            'provider': payment_reference.get('provider', ''),
            'guest_or_table': (
                f'Table {payment.order.table.table_number}'
                if payment.order.table_id
                else f'Room {payment.order.room_booking.room.room_number}'
                if payment.order.room_booking_id and payment.order.room_booking.room_id
                else payment.order.get_order_type_display()
            ),
            'payment_method': payment.payment_method,
            'amount': payment.amount,
            'paid_at': payment.paid_at,
            }
        )
    folio_rows = []
    for folio in folios.select_related('booking', 'booking__guest', 'booking__room').order_by('paid_at', 'created_at'):
        payment_reference = get_settled_payment_reference(source_module='guest_folio', source_id=folio.id) or {}
        folio_rows.append(
            {
            'source': 'folio',
            'reference': folio.folio_number,
            'provider_reference': payment_reference.get('provider_reference', ''),
            'provider': payment_reference.get('provider', ''),
            'guest_or_table': f'Room {folio.booking.room.room_number} - {folio.booking.guest}',
            'payment_method': folio.payment_method,
            'amount': folio.paid_amount,
            'paid_at': folio.paid_at,
            }
        )
    return sorted(restaurant_rows + folio_rows, key=lambda row: row['paid_at'] or timezone.now())


def calculate_cashier_shift_totals(shift, *, closed_at=None):
    end_time = closed_at or shift.closed_at or timezone.now()
    restaurant_orders = RestaurantOrder.objects.filter(status='paid').filter(
        Q(cashier_shift=shift) | Q(cashier_shift__isnull=True, paid_at__gte=shift.opened_at, paid_at__lte=end_time),
    )
    folios = GuestFolio.objects.filter(status='paid').filter(
        Q(cashier_shift=shift) | Q(cashier_shift__isnull=True, paid_at__gte=shift.opened_at, paid_at__lte=end_time),
    )

    restaurant_payments = RestaurantOrderPayment.objects.filter(order__in=restaurant_orders)
    restaurant_cash = _sum_order_payments(restaurant_payments.filter(payment_method='cash'))
    folio_cash = _sum_payments(folios.filter(payment_method='cash'))
    expected_cash = shift.opening_cash + restaurant_cash + folio_cash

    expected_card = _sum_order_payments(restaurant_payments.filter(payment_method='card')) + _sum_payments(folios.filter(payment_method='card'))
    expected_wallet = _sum_order_payments(restaurant_payments.filter(payment_method='wallet')) + _sum_payments(folios.filter(payment_method='wallet'))
    expected_bank_transfer = _sum_order_payments(restaurant_payments.filter(payment_method='bank_transfer')) + _sum_payments(folios.filter(payment_method='bank_transfer'))
    expected_room_posting = _sum_order_payments(restaurant_payments.filter(payment_method='room_posting'))
    expected_total = expected_cash + expected_card + expected_wallet + expected_bank_transfer + expected_room_posting

    facility_charges = GuestFolioLine.objects.filter(folio__cashier_shift=shift).exclude(source_module='restaurant_order')
    payment_breakdown = [
        _payment_total_row('cash', 'Cash', restaurant_payments, folios),
        _payment_total_row('card', 'Card', restaurant_payments, folios),
        _payment_total_row('wallet', 'Wallet', restaurant_payments, folios),
        _payment_total_row('bank_transfer', 'Bank Transfer', restaurant_payments, folios),
        {
            'payment_method': 'room_posting',
            'label': 'Room Posting',
            'restaurant_total': expected_room_posting,
            'folio_total': Decimal('0.00'),
            'total': expected_room_posting,
        },
    ]
    actual_by_method, variance_by_method = _reconciliation_amounts(shift)
    if shift.status == 'closed':
        for row in payment_breakdown:
            row['actual_total'] = actual_by_method[row['payment_method']]
            row['variance'] = variance_by_method[row['payment_method']]
    else:
        for row in payment_breakdown:
            row['actual_total'] = None
            row['variance'] = None
    sales_total = sum((row['total'] for row in payment_breakdown), Decimal('0.00'))

    return {
        'restaurant_cash': restaurant_cash,
        'folio_cash': folio_cash,
        'facility_charges': facility_charges.aggregate(total=Sum('amount'))['total'] or Decimal('0.00'),
        'opening_cash': shift.opening_cash,
        'cash_sales': restaurant_cash + folio_cash,
        'expected_cash': expected_cash,
        'expected_card': expected_card,
        'expected_wallet': expected_wallet,
        'expected_bank_transfer': expected_bank_transfer,
        'expected_room_posting': expected_room_posting,
        'expected_total': expected_total,
        'actual_cash': shift.actual_cash,
        'actual_card': shift.actual_card,
        'actual_wallet': shift.actual_wallet,
        'actual_bank_transfer': shift.actual_bank_transfer,
        'actual_room_posting': shift.actual_room_posting,
        'cash_variance': shift.cash_variance,
        'card_variance': shift.card_variance,
        'wallet_variance': shift.wallet_variance,
        'bank_transfer_variance': shift.bank_transfer_variance,
        'room_posting_variance': shift.room_posting_variance,
        'total_variance': shift.total_variance,
        'sales_total': sales_total,
        'payment_breakdown': payment_breakdown,
        'payment_rows': _cashier_shift_payment_rows(restaurant_orders, folios),
    }


def get_pos_manager_analytics(*, date_from=None, date_to=None):
    paid_orders = RestaurantOrder.objects.filter(status='paid')
    if date_from:
        paid_orders = paid_orders.filter(paid_at__date__gte=date_from)
    if date_to:
        paid_orders = paid_orders.filter(paid_at__date__lte=date_to)

    paid_orders = paid_orders.select_related('table').prefetch_related('payments', 'lines', 'lines__menu_item')
    order_count = paid_orders.count()
    gross_sales = paid_orders.aggregate(total=Sum('subtotal'))['total'] or Decimal('0.00')
    tax_total = paid_orders.aggregate(total=Sum('tax_total'))['total'] or Decimal('0.00')
    service_charge_total = paid_orders.aggregate(total=Sum('service_charge_total'))['total'] or Decimal('0.00')
    discount_total = paid_orders.aggregate(total=Sum('discount_total'))['total'] or Decimal('0.00')
    net_sales = paid_orders.aggregate(total=Sum('grand_total'))['total'] or Decimal('0.00')

    payment_buckets = {}
    for payment in RestaurantOrderPayment.objects.filter(order__in=paid_orders):
        bucket = payment_buckets.setdefault(payment.payment_method, {'payment_method': payment.payment_method, 'count': 0, 'amount': Decimal('0.00')})
        bucket['count'] += 1
        bucket['amount'] += payment.amount

    daily_buckets = {}
    table_buckets = {}
    item_buckets = {}
    for order in paid_orders:
        business_date = timezone.localtime(order.paid_at).date() if order.paid_at else order.created_at.date()
        daily = daily_buckets.setdefault(str(business_date), {'date': business_date, 'orders': 0, 'net_sales': Decimal('0.00')})
        daily['orders'] += 1
        daily['net_sales'] += order.grand_total

        table_label = f'Table {order.table.table_number}' if order.table_id else order.get_order_type_display()
        table_key = str(order.table_id or order.order_type)
        table = table_buckets.setdefault(table_key, {'label': table_label, 'orders': 0, 'net_sales': Decimal('0.00')})
        table['orders'] += 1
        table['net_sales'] += order.grand_total

        for line in order.lines.all():
            if line.status == 'cancelled':
                continue
            item_key = str(line.menu_item_id)
            item = item_buckets.setdefault(
                item_key,
                {
                    'item_id': item_key,
                    'item_name': line.menu_item.name,
                    'quantity': 0,
                    'net_sales': Decimal('0.00'),
                },
            )
            item['quantity'] += line.quantity
            item['net_sales'] += line.line_total

    approvals = RestaurantOrderApproval.objects.all()
    if date_from:
        approvals = approvals.filter(created_at__date__gte=date_from)
    if date_to:
        approvals = approvals.filter(created_at__date__lte=date_to)

    reprints = RestaurantReceiptReprint.objects.all()
    if date_from:
        reprints = reprints.filter(reprinted_at__date__gte=date_from)
    if date_to:
        reprints = reprints.filter(reprinted_at__date__lte=date_to)

    closed_shifts = CashierShift.objects.filter(status='closed')
    if date_from:
        closed_shifts = closed_shifts.filter(business_date__gte=date_from)
    if date_to:
        closed_shifts = closed_shifts.filter(business_date__lte=date_to)
    total_variance = closed_shifts.aggregate(total=Sum('total_variance'))['total'] or Decimal('0.00')

    approval_counts = {
        row['action_type']: row['count']
        for row in approvals.values('action_type').annotate(count=Count('id'))
    }

    return {
        'date_from': date_from,
        'date_to': date_to,
        'summary': {
            'orders': order_count,
            'gross_sales': gross_sales,
            'tax_total': tax_total,
            'service_charge_total': service_charge_total,
            'discount_total': discount_total,
            'net_sales': net_sales,
            'average_check': net_sales / order_count if order_count else Decimal('0.00'),
        },
        'payments': sorted(payment_buckets.values(), key=lambda row: row['amount'], reverse=True),
        'daily_sales': sorted(daily_buckets.values(), key=lambda row: row['date']),
        'top_items': sorted(item_buckets.values(), key=lambda row: row['net_sales'], reverse=True)[:10],
        'table_performance': sorted(table_buckets.values(), key=lambda row: row['net_sales'], reverse=True)[:10],
        'exceptions': {
            'pending_approvals': approvals.filter(status='pending').count(),
            'approved_voids': approval_counts.get('void_line', 0),
            'discount_approvals': approval_counts.get('discount', 0),
            'complimentary_approvals': approval_counts.get('complimentary', 0),
            'receipt_reprints': reprints.count(),
            'closed_shifts': closed_shifts.count(),
            'total_variance': total_variance,
        },
    }


@transaction.atomic
def open_cashier_shift(*, cashier, counter, opening_cash=0, business_date=None, notes=''):
    open_shift = CashierShift.objects.filter(cashier=cashier, status='open').first()
    if open_shift:
        raise CashierShiftError('This cashier already has an open shift.')
    if CashierShift.objects.filter(counter=counter, status='open').exists():
        raise CashierShiftError('This counter already has an open shift.')
    if not counter.is_active:
        raise CashierShiftError('Cannot open a shift on an inactive counter.')

    return CashierShift.objects.create(
        cashier=cashier,
        counter=counter,
        business_date=business_date or timezone.localdate(),
        opening_cash=Decimal(str(opening_cash or 0)),
        notes=notes,
    )


@transaction.atomic
def close_cashier_shift(
    shift,
    *,
    actual_cash,
    actual_card=None,
    actual_wallet=None,
    actual_bank_transfer=None,
    actual_room_posting=None,
    notes='',
):
    if shift.status != 'open':
        raise CashierShiftError('Only open shifts can be closed.')

    closed_at = timezone.now()
    totals = calculate_cashier_shift_totals(shift, closed_at=closed_at)
    shift.expected_cash = totals['expected_cash']
    shift.expected_card = totals['expected_card']
    shift.expected_wallet = totals['expected_wallet']
    shift.expected_bank_transfer = totals['expected_bank_transfer']
    shift.expected_room_posting = totals['expected_room_posting']
    shift.expected_total = totals['expected_total']
    shift.actual_cash = Decimal(str(actual_cash or 0))
    shift.actual_card = Decimal(str(actual_card if actual_card is not None else shift.expected_card))
    shift.actual_wallet = Decimal(str(actual_wallet if actual_wallet is not None else shift.expected_wallet))
    shift.actual_bank_transfer = Decimal(str(actual_bank_transfer if actual_bank_transfer is not None else shift.expected_bank_transfer))
    shift.actual_room_posting = Decimal(str(actual_room_posting if actual_room_posting is not None else shift.expected_room_posting))
    shift.cash_variance = shift.actual_cash - shift.expected_cash
    shift.card_variance = shift.actual_card - shift.expected_card
    shift.wallet_variance = shift.actual_wallet - shift.expected_wallet
    shift.bank_transfer_variance = shift.actual_bank_transfer - shift.expected_bank_transfer
    shift.room_posting_variance = shift.actual_room_posting - shift.expected_room_posting
    shift.total_variance = (
        shift.cash_variance
        + shift.card_variance
        + shift.wallet_variance
        + shift.bank_transfer_variance
        + shift.room_posting_variance
    )
    shift.status = 'closed'
    shift.closed_at = closed_at
    if notes:
        shift.notes = f'{shift.notes}\n{notes}'.strip()
    shift.save(
        update_fields=[
            'expected_cash',
            'expected_card',
            'expected_wallet',
            'expected_bank_transfer',
            'expected_room_posting',
            'expected_total',
            'actual_cash',
            'actual_card',
            'actual_wallet',
            'actual_bank_transfer',
            'actual_room_posting',
            'cash_variance',
            'card_variance',
            'wallet_variance',
            'bank_transfer_variance',
            'room_posting_variance',
            'total_variance',
            'status',
            'closed_at',
            'notes',
            'updated_at',
        ],
    )
    return shift
