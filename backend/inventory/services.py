from inventory.models import StockMovement


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
