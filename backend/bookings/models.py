from decimal import Decimal

from django.db import models
from django.utils import timezone

from core.models import UUIDModel


class RoomType(UUIDModel):
    name = models.CharField(max_length=80, unique=True)
    code = models.CharField(max_length=30, unique=True)
    base_occupancy = models.PositiveIntegerField(default=1)
    max_occupancy = models.PositiveIntegerField(default=2)
    base_rate = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.TextField(blank=True)
    amenities = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Room(UUIDModel):
    room_number = models.CharField(max_length=10, unique=True)
    room_type = models.ForeignKey(RoomType, on_delete=models.PROTECT, related_name='rooms')
    capacity = models.PositiveIntegerField(default=1)
    price_per_night = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=[
            ('available', 'Available'),
            ('occupied', 'Occupied'),
            ('maintenance', 'Maintenance'),
            ('cleaning', 'Cleaning'),
        ],
        default='available'
    )
    description = models.TextField(blank=True)
    amenities = models.JSONField(default=dict, blank=True)  # e.g., {"wifi": true, "tv": true}

    class Meta:
        ordering = ['room_number']

    def __str__(self):
        return f"Room {self.room_number} - {self.room_type.name}"


class Guest(UUIDModel):
    VIP_LEVEL_CHOICES = [
        ('standard', 'Standard'),
        ('vip', 'VIP'),
        ('blacklist', 'Do Not Book'),
    ]

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    id_type = models.CharField(max_length=50, blank=True)  # e.g., Passport, ID Card
    id_number = models.CharField(max_length=50, blank=True)
    vip_level = models.CharField(max_length=20, choices=VIP_LEVEL_CHOICES, default='standard')
    preferences = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)
    marketing_opt_in = models.BooleanField(default=False)

    class Meta:
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f"{self.first_name} {self.last_name}"


class Booking(UUIDModel):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='bookings')
    guest = models.ForeignKey(Guest, on_delete=models.CASCADE, related_name='bookings')
    rate_plan = models.ForeignKey('RatePlan', on_delete=models.SET_NULL, null=True, blank=True)
    package = models.ForeignKey('Package', on_delete=models.SET_NULL, null=True, blank=True)
    check_in_date = models.DateField()
    check_out_date = models.DateField()
    number_of_guests = models.PositiveIntegerField(default=1)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(
        max_length=20,
        choices=[
            ('confirmed', 'Confirmed'),
            ('checked_in', 'Checked In'),
            ('checked_out', 'Checked Out'),
            ('cancelled', 'Cancelled'),
            ('no_show', 'No Show'),
        ],
        default='confirmed'
    )
    special_requests = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-check_in_date']

    def __str__(self):
        return f"Booking {self.id} - Room {self.room.room_number} - {self.guest}"

    def save(self, *args, **kwargs):
        # Calculate total amount based on nights and room price or rate plan
        if self.check_in_date and self.check_out_date and self.room:
            nights = (self.check_out_date - self.check_in_date).days
            rate = self.rate_plan.base_rate if self.rate_plan else self.room.price_per_night
            self.total_amount = Decimal(nights) * Decimal(str(rate))
        super().save(*args, **kwargs)


class GuestFolio(UUIDModel):
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('paid', 'Paid'),
        ('void', 'Void'),
    ]
    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('card', 'Card'),
        ('wallet', 'Wallet'),
        ('bank_transfer', 'Bank Transfer'),
    ]

    booking = models.OneToOneField(Booking, on_delete=models.PROTECT, related_name='folio')
    folio_number = models.CharField(max_length=40, unique=True, blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    service_charge_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    payment_method = models.CharField(max_length=30, choices=PAYMENT_METHOD_CHOICES, blank=True)
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    paid_at = models.DateTimeField(null=True, blank=True)
    cashier_shift = models.ForeignKey('restaurant.CashierShift', on_delete=models.SET_NULL, related_name='guest_folios', null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.folio_number or str(self.id)

    @property
    def charge_total(self):
        if not self.pk:
            return 0
        return sum((line.amount for line in self.lines.all()), 0)

    def recalculate_totals(self):
        self.grand_total = self.subtotal + self.tax_total + self.service_charge_total + self.charge_total
        self.save(update_fields=['grand_total', 'updated_at'])

    def save(self, *args, **kwargs):
        if not self.folio_number:
            self.folio_number = f'FOL-{self.id.hex[:10].upper()}'
        if not self.subtotal:
            self.subtotal = self.booking.total_amount
        line_total = self.charge_total if self.pk else 0
        self.grand_total = self.subtotal + self.tax_total + self.service_charge_total + line_total
        super().save(*args, **kwargs)

    def settle(self, *, payment_method: str, paid_amount=None, cashier_shift=None):
        self.payment_method = payment_method
        self.paid_amount = paid_amount if paid_amount is not None else self.grand_total
        self.status = 'paid'
        self.paid_at = timezone.now()
        self.cashier_shift = cashier_shift
        self.save(update_fields=['payment_method', 'paid_amount', 'status', 'paid_at', 'cashier_shift', 'grand_total', 'updated_at'])


class GuestFolioLine(UUIDModel):
    folio = models.ForeignKey(GuestFolio, on_delete=models.CASCADE, related_name='lines')
    source_module = models.CharField(max_length=80)
    source_id = models.CharField(max_length=80)
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ['created_at']
        constraints = [
            models.UniqueConstraint(fields=['source_module', 'source_id'], name='unique_folio_source_charge'),
        ]

    def __str__(self):
        return self.description

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.folio.recalculate_totals()


class FacilityAmenity(UUIDModel):
    name = models.CharField(max_length=120, unique=True)
    code = models.CharField(max_length=40, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return self.name


class FacilityService(UUIDModel):
    CATEGORY_CHOICES = [
        ('pool', 'Pool'),
        ('spa', 'Spa'),
        ('laundry', 'Laundry'),
        ('minibar', 'Minibar'),
        ('extra_bed', 'Extra Bed'),
        ('transport', 'Transport'),
        ('banquet', 'Banquet'),
        ('other', 'Other'),
    ]

    name = models.CharField(max_length=120, unique=True)
    code = models.CharField(max_length=40, unique=True)
    amenity = models.ForeignKey(FacilityAmenity, on_delete=models.PROTECT, related_name='services', null=True, blank=True)
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='other')
    default_price = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['amenity__name', 'category', 'name']
        indexes = [
            models.Index(fields=['amenity', 'is_active']),
            models.Index(fields=['category', 'is_active']),
            models.Index(fields=['code']),
        ]

    def __str__(self):
        return self.name


class RatePlan(UUIDModel):
    name = models.CharField(max_length=100)
    room_type = models.ForeignKey(RoomType, on_delete=models.CASCADE, related_name='rate_plans')
    base_rate = models.DecimalField(max_digits=10, decimal_places=2)
    is_active = models.BooleanField(default=True)
    valid_from = models.DateField()
    valid_to = models.DateField()
    conditions = models.JSONField(default=dict, blank=True)  # e.g., {"min_stay": 2, "max_stay": 7}

    def __str__(self):
        return self.name


class Package(UUIDModel):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    total_price = models.DecimalField(max_digits=10, decimal_places=2)
    includes = models.JSONField(default=list)  # List of included services/items
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class LoyaltyProgram(UUIDModel):
    name = models.CharField(max_length=100)
    points_per_dollar = models.DecimalField(max_digits=5, decimal_places=2, default=1.00)
    redemption_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0.01)  # $ per point
    tiers = models.JSONField(default=list)  # e.g., [{"name": "Gold", "min_points": 1000}]
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class GuestPoints(UUIDModel):
    guest = models.OneToOneField(Guest, on_delete=models.CASCADE, related_name='loyalty')
    program = models.ForeignKey(LoyaltyProgram, on_delete=models.CASCADE)
    total_points = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    redeemed_points = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tier = models.CharField(max_length=50, blank=True)

    @property
    def available_points(self):
        return self.total_points - self.redeemed_points

    def __str__(self):
        return f"{self.guest} - {self.available_points} points"


class GuestCommunication(UUIDModel):
    CHANNEL_CHOICES = [
        ('email', 'Email'),
        ('phone', 'Phone'),
        ('sms', 'SMS'),
        ('whatsapp', 'WhatsApp'),
        ('in_person', 'In Person'),
        ('note', 'Internal Note'),
    ]
    DIRECTION_CHOICES = [
        ('inbound', 'Inbound'),
        ('outbound', 'Outbound'),
        ('internal', 'Internal'),
    ]
    STATUS_CHOICES = [
        ('logged', 'Logged'),
        ('sent', 'Sent'),
        ('failed', 'Failed'),
        ('follow_up', 'Follow Up'),
    ]

    guest = models.ForeignKey(Guest, on_delete=models.CASCADE, related_name='communications')
    booking = models.ForeignKey(Booking, on_delete=models.SET_NULL, related_name='communications', null=True, blank=True)
    channel = models.CharField(max_length=30, choices=CHANNEL_CHOICES)
    direction = models.CharField(max_length=30, choices=DIRECTION_CHOICES, default='internal')
    subject = models.CharField(max_length=160, blank=True)
    message = models.TextField()
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='logged')
    occurred_at = models.DateTimeField(default=timezone.now)
    created_by = models.ForeignKey('users.PlatformUser', on_delete=models.SET_NULL, related_name='guest_communications', null=True, blank=True)

    class Meta:
        ordering = ['-occurred_at', '-created_at']
        indexes = [
            models.Index(fields=['guest', '-occurred_at']),
            models.Index(fields=['booking', '-occurred_at']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        subject = self.subject or self.get_channel_display()
        return f"{self.guest} - {subject}"
