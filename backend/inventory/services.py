from django.utils import timezone

from inventory.models import PurchaseOrder, StockMovement


def receive_inventory_stock(
    *,
    item,
    quantity,
    unit_cost,
    vendor=None,
    reference='',
    notes='',
    payment_account='2000',
    posted_by=None,
):
    movement = StockMovement.objects.create(
        item=item,
        vendor=vendor,
        movement_type='purchase',
        quantity=quantity,
        unit_cost=unit_cost,
        reference=reference,
        notes=notes,
        source_module='inventory_purchase',
        created_by=posted_by,
    )
    movement.source_id = str(movement.id)
    movement.save(update_fields=['source_id'])

    item.cost_price = unit_cost
    item.save(update_fields=['cost_price', 'updated_at'])

    from accounting.services import post_inventory_purchase

    post_inventory_purchase(movement, payment_account=payment_account, posted_by=posted_by)
    return movement


def submit_purchase_order(purchase_order: PurchaseOrder):
    if purchase_order.status != 'draft':
        raise ValueError('Only draft purchase orders can be ordered.')
    if not purchase_order.lines.exists():
        raise ValueError('Purchase order must have at least one line.')
    purchase_order.status = 'ordered'
    purchase_order.save(update_fields=['status', 'updated_at'])
    return purchase_order


def cancel_purchase_order(purchase_order: PurchaseOrder):
    if purchase_order.status in ['received', 'canceled']:
        raise ValueError('Purchase order cannot be canceled.')
    purchase_order.status = 'canceled'
    purchase_order.save(update_fields=['status', 'updated_at'])
    return purchase_order


def receive_purchase_order(purchase_order: PurchaseOrder, posted_by=None):
    if purchase_order.status not in ['draft', 'ordered']:
        raise ValueError('Only draft or ordered purchase orders can be received.')
    if not purchase_order.lines.exists():
        raise ValueError('Purchase order must have at least one line.')

    movements = []
    for line in purchase_order.lines.select_related('item'):
        movement = receive_inventory_stock(
            item=line.item,
            vendor=purchase_order.vendor,
            quantity=line.quantity,
            unit_cost=line.unit_cost,
            reference=purchase_order.po_number,
            notes=line.notes or purchase_order.notes,
            payment_account='2000',
            posted_by=posted_by,
        )
        movement.source_module = 'purchase_order'
        movement.source_id = str(purchase_order.id)
        movement.save(update_fields=['source_module', 'source_id', 'updated_at'])
        movements.append(movement)

    purchase_order.status = 'received'
    purchase_order.received_at = timezone.now()
    purchase_order.save(update_fields=['status', 'received_at', 'updated_at'])
    return purchase_order, movements


def pay_purchase_order(purchase_order: PurchaseOrder, payment_method='cash', posted_by=None):
    if purchase_order.status != 'received':
        raise ValueError('Only received purchase orders can be paid.')
    if purchase_order.payment_status == 'paid':
        raise ValueError('Purchase order is already paid.')
    if payment_method not in dict(PurchaseOrder.PAYMENT_METHOD_CHOICES):
        raise ValueError('Invalid payment method.')

    payment_account = '1010' if payment_method == 'bank' else '1000'
    from accounting.services import post_purchase_order_payment

    post_purchase_order_payment(purchase_order, payment_account=payment_account, posted_by=posted_by)
    purchase_order.payment_status = 'paid'
    purchase_order.payment_method = payment_method
    purchase_order.paid_at = timezone.now()
    purchase_order.save(update_fields=['payment_status', 'payment_method', 'paid_at', 'updated_at'])
    return purchase_order


def deduct_restaurant_order_inventory(order, posted_by=None):
    movements = []
    for line in order.lines.select_related('menu_item', 'menu_item__inventory_item').exclude(status='cancelled'):
        inventory_item = line.menu_item.inventory_item
        quantity_per_unit = line.menu_item.inventory_quantity_per_unit
        if not inventory_item or not quantity_per_unit:
            continue

        movement, created = StockMovement.objects.get_or_create(
            item=inventory_item,
            movement_type='sale',
            source_module='restaurant_order_line',
            source_id=str(line.id),
            defaults={
                'quantity': line.quantity * quantity_per_unit,
                'unit_cost': inventory_item.cost_price,
                'reference': order.order_number,
                'notes': f'Stock deduction for {line.quantity} x {line.menu_item.name}',
                'created_by': posted_by,
            },
        )
        if created:
            movements.append(movement)
    return movements
