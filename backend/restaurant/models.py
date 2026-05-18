from django.db import models

from core.models import UUIDModel


class MenuCategory(UUIDModel):
    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['display_order', 'name']

    def __str__(self):
        return self.name


class MenuItem(UUIDModel):
    category = models.ForeignKey(MenuCategory, on_delete=models.PROTECT, related_name='items')
    inventory_item = models.ForeignKey(
        'inventory.InventoryItem',
        on_delete=models.PROTECT,
        related_name='menu_items',
        null=True,
        blank=True,
    )
    inventory_quantity_per_unit = models.DecimalField(max_digits=12, decimal_places=3, default=0)
    name = models.CharField(max_length=150)
    sku = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to='menu-items/', null=True, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    preparation_station = models.CharField(
        max_length=40,
        choices=[
            ('kitchen', 'Kitchen'),
            ('bar', 'Bar'),
            ('pastry', 'Pastry'),
            ('counter', 'Counter'),
        ],
        default='kitchen',
    )
    preparation_time_minutes = models.PositiveIntegerField(default=15)
    is_available = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['category__display_order', 'name']

    def __str__(self):
        return self.name


class RestaurantTable(UUIDModel):
    table_number = models.CharField(max_length=20, unique=True)
    section = models.CharField(max_length=80, blank=True)
    capacity = models.PositiveIntegerField(default=2)
    status = models.CharField(
        max_length=20,
        choices=[
            ('available', 'Available'),
            ('occupied', 'Occupied'),
            ('reserved', 'Reserved'),
            ('cleaning', 'Cleaning'),
            ('inactive', 'Inactive'),
        ],
        default='available',
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['section', 'table_number']

    def __str__(self):
        return f'Table {self.table_number}'


class RestaurantOrder(UUIDModel):
    ORDER_TYPE_CHOICES = [
        ('dine_in', 'Dine In'),
        ('takeaway', 'Takeaway'),
        ('room_service', 'Room Service'),
    ]

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('sent_to_kitchen', 'Sent To Kitchen'),
        ('preparing', 'Preparing'),
        ('served', 'Served'),
        ('paid', 'Paid'),
        ('cancelled', 'Cancelled'),
    ]

    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('card', 'Card'),
        ('wallet', 'Wallet'),
        ('room_posting', 'Room Posting'),
        ('bank_transfer', 'Bank Transfer'),
    ]

    table = models.ForeignKey(RestaurantTable, on_delete=models.PROTECT, related_name='orders', null=True, blank=True)
    room_booking = models.ForeignKey('bookings.Booking', on_delete=models.PROTECT, related_name='restaurant_orders', null=True, blank=True)
    order_number = models.CharField(max_length=30, unique=True, blank=True)
    order_type = models.CharField(max_length=20, choices=ORDER_TYPE_CHOICES, default='dine_in')
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='draft')
    waiter = models.ForeignKey('users.PlatformUser', on_delete=models.SET_NULL, related_name='restaurant_orders', null=True, blank=True)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    service_charge_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    paid_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payment_method = models.CharField(max_length=30, choices=PAYMENT_METHOD_CHOICES, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    cashier_shift = models.ForeignKey('restaurant.CashierShift', on_delete=models.SET_NULL, related_name='restaurant_orders', null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.order_number:
            self.order_number = f'ORD-{self.id.hex[:8].upper()}'
        super().save(*args, **kwargs)

    def recalculate_totals(self):
        subtotal = sum(line.line_total for line in self.lines.exclude(status='cancelled'))
        max_discount = subtotal + self.tax_total + self.service_charge_total
        if self.discount_total > max_discount:
            self.discount_total = max_discount
        self.subtotal = subtotal
        self.grand_total = subtotal + self.tax_total + self.service_charge_total - self.discount_total
        self.save(update_fields=['subtotal', 'discount_total', 'grand_total', 'updated_at'])

    def __str__(self):
        return self.order_number


class RestaurantOrderLine(UUIDModel):
    STATUS_CHOICES = [
        ('ordered', 'Ordered'),
        ('preparing', 'Preparing'),
        ('ready', 'Ready'),
        ('served', 'Served'),
        ('cancelled', 'Cancelled'),
    ]

    order = models.ForeignKey(RestaurantOrder, on_delete=models.CASCADE, related_name='lines')
    menu_item = models.ForeignKey(MenuItem, on_delete=models.PROTECT, related_name='order_lines')
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    line_total = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ordered')

    class Meta:
        ordering = ['created_at']

    def save(self, *args, **kwargs):
        self.unit_price = self.unit_price or self.menu_item.price
        self.line_total = self.quantity * self.unit_price
        super().save(*args, **kwargs)
        self.order.recalculate_totals()

    def __str__(self):
        return f'{self.quantity} x {self.menu_item.name}'


class KitchenTicket(UUIDModel):
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('preparing', 'Preparing'),
        ('ready', 'Ready'),
        ('served', 'Served'),
    ]

    order = models.ForeignKey(RestaurantOrder, on_delete=models.CASCADE, related_name='kitchen_tickets')
    ticket_number = models.CharField(max_length=30, unique=True, blank=True)
    station = models.CharField(max_length=40)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')

    class Meta:
        ordering = ['created_at']

    def save(self, *args, **kwargs):
        if not self.ticket_number:
            self.ticket_number = f'KOT-{self.id.hex[:8].upper()}'
        super().save(*args, **kwargs)

    def __str__(self):
        return self.ticket_number


class KitchenTicketLine(UUIDModel):
    ticket = models.ForeignKey(KitchenTicket, on_delete=models.CASCADE, related_name='lines')
    order_line = models.ForeignKey(RestaurantOrderLine, on_delete=models.CASCADE, related_name='ticket_lines')
    quantity = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=RestaurantOrderLine.STATUS_CHOICES, default='ordered')

    class Meta:
        ordering = ['created_at']


class CashierCounter(UUIDModel):
    OUTLET_TYPE_CHOICES = [
        ('reception', 'Reception'),
        ('restaurant', 'Restaurant'),
        ('pool', 'Pool'),
        ('spa', 'Spa'),
        ('bar', 'Bar'),
        ('banquet', 'Banquet'),
        ('other', 'Other'),
    ]

    name = models.CharField(max_length=120, unique=True)
    code = models.CharField(max_length=50, unique=True)
    outlet_type = models.CharField(max_length=30, choices=OUTLET_TYPE_CHOICES, default='other')
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['outlet_type', 'name']

    def __str__(self):
        return self.name


class CashierShift(UUIDModel):
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('closed', 'Closed'),
    ]

    counter = models.ForeignKey(CashierCounter, on_delete=models.PROTECT, related_name='shifts')
    cashier = models.ForeignKey('users.PlatformUser', on_delete=models.PROTECT, related_name='cashier_shifts')
    business_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    opening_cash = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expected_cash = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expected_card = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expected_wallet = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expected_bank_transfer = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expected_room_posting = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    expected_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    actual_cash = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cash_variance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-opened_at']

    def __str__(self):
        return f'{self.cashier} - {self.business_date} - {self.status}'
