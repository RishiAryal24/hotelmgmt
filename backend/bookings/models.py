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
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    id_type = models.CharField(max_length=50, blank=True)  # e.g., Passport, ID Card
    id_number = models.CharField(max_length=50, blank=True)

    class Meta:
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f"{self.first_name} {self.last_name}"


class Booking(UUIDModel):
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='bookings')
    guest = models.ForeignKey(Guest, on_delete=models.CASCADE, related_name='bookings')
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
        # Calculate total amount based on nights and room price
        if self.check_in_date and self.check_out_date and self.room:
            nights = (self.check_out_date - self.check_in_date).days
            self.total_amount = nights * self.room.price_per_night
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

    def settle(self, *, payment_method: str, paid_amount=None):
        self.payment_method = payment_method
        self.paid_amount = paid_amount if paid_amount is not None else self.grand_total
        self.status = 'paid'
        self.paid_at = timezone.now()
        self.save(update_fields=['payment_method', 'paid_amount', 'status', 'paid_at', 'grand_total', 'updated_at'])


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
