from django.db import models
from django.db.models import Sum

from core.models import UUIDModel


class Vendor(UUIDModel):
    name = models.CharField(max_length=150, unique=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    address = models.TextField(blank=True)
    tax_number = models.CharField(max_length=80, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class InventoryItem(UUIDModel):
    UNIT_CHOICES = [
        ('pcs', 'Pieces'),
        ('kg', 'Kilogram'),
        ('g', 'Gram'),
        ('l', 'Liter'),
        ('ml', 'Milliliter'),
        ('pack', 'Pack'),
        ('box', 'Box'),
        ('bottle', 'Bottle'),
    ]

    sku = models.CharField(max_length=60, unique=True)
    name = models.CharField(max_length=150)
    category = models.CharField(max_length=80, blank=True)
    unit = models.CharField(max_length=20, choices=UNIT_CHOICES, default='pcs')
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reorder_level = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.sku} - {self.name}'

    @property
    def current_stock(self):
        incoming = self.stock_movements.filter(movement_type__in=['purchase', 'adjustment_in']).aggregate(
            total=Sum('quantity')
        )['total'] or 0
        outgoing = self.stock_movements.filter(movement_type__in=['sale', 'waste', 'adjustment_out']).aggregate(
            total=Sum('quantity')
        )['total'] or 0
        return incoming - outgoing

    @property
    def is_low_stock(self):
        return self.current_stock <= self.reorder_level


class StockMovement(UUIDModel):
    MOVEMENT_TYPE_CHOICES = [
        ('purchase', 'Purchase'),
        ('sale', 'Sale'),
        ('waste', 'Waste'),
        ('adjustment_in', 'Adjustment In'),
        ('adjustment_out', 'Adjustment Out'),
    ]

    item = models.ForeignKey(InventoryItem, on_delete=models.PROTECT, related_name='stock_movements')
    vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, related_name='stock_movements', null=True, blank=True)
    movement_type = models.CharField(max_length=30, choices=MOVEMENT_TYPE_CHOICES)
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    reference = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    source_module = models.CharField(max_length=80, blank=True)
    source_id = models.CharField(max_length=80, blank=True)
    occurred_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey('users.PlatformUser', on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        ordering = ['-occurred_at', '-created_at']

    def __str__(self):
        return f'{self.item.sku} {self.movement_type} {self.quantity}'

    @property
    def total_cost(self):
        return self.quantity * self.unit_cost


class PurchaseOrder(UUIDModel):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('ordered', 'Ordered'),
        ('received', 'Received'),
        ('canceled', 'Canceled'),
    ]
    PAYMENT_STATUS_CHOICES = [
        ('unpaid', 'Unpaid'),
        ('paid', 'Paid'),
    ]
    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('bank', 'Bank'),
    ]

    po_number = models.CharField(max_length=40, unique=True, blank=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.PROTECT, related_name='purchase_orders')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='unpaid')
    order_date = models.DateField(auto_now_add=True)
    expected_date = models.DateField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, blank=True)
    reference = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey('users.PlatformUser', on_delete=models.SET_NULL, related_name='purchase_orders', null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.po_number or str(self.id)

    @property
    def total_amount(self):
        if not self.pk:
            return 0
        return sum((line.total_cost for line in self.lines.all()), 0)

    def save(self, *args, **kwargs):
        if not self.po_number:
            self.po_number = f'PO-{self.id.hex[:10].upper()}'
        super().save(*args, **kwargs)


class PurchaseOrderLine(UUIDModel):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='lines')
    item = models.ForeignKey(InventoryItem, on_delete=models.PROTECT, related_name='purchase_order_lines')
    quantity = models.DecimalField(max_digits=12, decimal_places=3)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.purchase_order.po_number} - {self.item.sku}'

    @property
    def total_cost(self):
        return self.quantity * self.unit_cost
