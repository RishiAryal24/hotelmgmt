from decimal import Decimal
from datetime import time

from django.db import models
from django.utils import timezone

from core.models import UUIDModel


class Account(UUIDModel):
    ACCOUNT_TYPE_CHOICES = [
        ('asset', 'Asset'),
        ('liability', 'Liability'),
        ('equity', 'Equity'),
        ('revenue', 'Revenue'),
        ('expense', 'Expense'),
    ]

    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=150)
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPE_CHOICES)
    parent = models.ForeignKey('self', on_delete=models.PROTECT, related_name='children', null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return f'{self.code} - {self.name}'


class TaxRate(UUIDModel):
    TAX_TYPE_CHOICES = [
        ('sales', 'Sales'),
        ('purchase', 'Purchase'),
        ('both', 'Sales and Purchase'),
    ]

    code = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=120)
    tax_type = models.CharField(max_length=20, choices=TAX_TYPE_CHOICES, default='sales')
    rate = models.DecimalField(max_digits=7, decimal_places=3)
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='tax_rates')
    description = models.TextField(blank=True)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['tax_type', 'name']

    def clean(self):
        if self.rate < 0:
            raise ValueError('Tax rate cannot be negative.')
        if self.account_id and self.account.account_type != 'liability':
            raise ValueError('Tax control account must be a liability account.')

    def __str__(self):
        return f'{self.name} ({self.rate}%)'


class VendorBill(UUIDModel):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('posted', 'Posted'),
        ('void', 'Void'),
    ]

    bill_number = models.CharField(max_length=40, unique=True, blank=True)
    vendor = models.ForeignKey('inventory.Vendor', on_delete=models.PROTECT, related_name='accounting_bills')
    invoice_number = models.CharField(max_length=80, blank=True)
    bill_date = models.DateField(default=timezone.localdate)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    journal_entry = models.ForeignKey('accounting.JournalEntry', on_delete=models.SET_NULL, null=True, blank=True, related_name='vendor_bills')
    posted_by = models.ForeignKey('users.PlatformUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='posted_vendor_bills')
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-bill_date', '-created_at']

    def save(self, *args, **kwargs):
        if not self.bill_number:
            self.bill_number = f'VB-{self.id.hex[:10].upper()}'
        super().save(*args, **kwargs)

    def recalculate_totals(self, save=True):
        subtotal = sum((line.amount for line in self.lines.all()), Decimal('0.00')) if self.pk else Decimal('0.00')
        tax_total = sum((line.tax_amount for line in self.lines.all()), Decimal('0.00')) if self.pk else Decimal('0.00')
        self.subtotal = subtotal
        self.tax_total = tax_total
        self.total_amount = subtotal + tax_total
        if save:
            self.save(update_fields=['subtotal', 'tax_total', 'total_amount', 'updated_at'])

    def __str__(self):
        return self.bill_number


class VendorBillLine(UUIDModel):
    vendor_bill = models.ForeignKey(VendorBill, on_delete=models.CASCADE, related_name='lines')
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='vendor_bill_lines')
    tax_rate = models.ForeignKey(TaxRate, on_delete=models.PROTECT, related_name='vendor_bill_lines', null=True, blank=True)
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ['created_at']

    @property
    def line_total(self):
        return self.amount + self.tax_amount

    def __str__(self):
        return f'{self.vendor_bill.bill_number} - {self.description}'


class NightAuditSchedule(UUIDModel):
    enabled = models.BooleanField(default=False)
    run_time = models.TimeField(default=time(2, 0))
    timezone = models.CharField(max_length=80, default='Asia/Katmandu')
    last_run_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Night audit schedule at {self.run_time}'


class NightAuditRun(UUIDModel):
    STATUS_CHOICES = [
        ('completed', 'Completed'),
        ('completed_with_exceptions', 'Completed with Exceptions'),
        ('failed', 'Failed'),
    ]

    audit_date = models.DateField()
    status = models.CharField(max_length=40, choices=STATUS_CHOICES, default='completed')
    started_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    triggered_by = models.ForeignKey('users.PlatformUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='night_audit_runs')
    checked_in_bookings = models.PositiveIntegerField(default=0)
    folios_reviewed = models.PositiveIntegerField(default=0)
    room_charge_lines_created = models.PositiveIntegerField(default=0)
    open_folios = models.PositiveIntegerField(default=0)
    paid_folios = models.PositiveIntegerField(default=0)
    exceptions = models.JSONField(default=list, blank=True)
    summary = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ['-audit_date', '-created_at']
        constraints = [
            models.UniqueConstraint(fields=['audit_date'], name='unique_night_audit_run_date'),
        ]

    def __str__(self):
        return f'Night audit {self.audit_date} - {self.status}'


class FiscalPeriod(UUIDModel):
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('closed', 'Closed'),
    ]

    name = models.CharField(max_length=120, unique=True)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey('users.PlatformUser', on_delete=models.SET_NULL, null=True, blank=True, related_name='closed_fiscal_periods')

    class Meta:
        ordering = ['-start_date', '-created_at']

    def clean(self):
        if self.start_date > self.end_date:
            raise ValueError('Fiscal period start date must be on or before end date.')

    def __str__(self):
        return self.name


class JournalEntry(UUIDModel):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('posted', 'Posted'),
        ('void', 'Void'),
    ]

    entry_number = models.CharField(max_length=40, unique=True, blank=True)
    entry_date = models.DateField(default=timezone.localdate)
    description = models.TextField(blank=True)
    source_module = models.CharField(max_length=80, blank=True)
    source_id = models.CharField(max_length=80, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='posted')
    fiscal_period = models.ForeignKey('accounting.FiscalPeriod', on_delete=models.SET_NULL, null=True, blank=True, related_name='journal_entries')
    posted_by = models.ForeignKey('users.PlatformUser', on_delete=models.SET_NULL, null=True, blank=True)
    posted_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-entry_date', '-created_at']

    def save(self, *args, **kwargs):
        if not self.entry_number:
            self.entry_number = f'JE-{self.id.hex[:10].upper()}'
        super().save(*args, **kwargs)

    @property
    def total_debit(self):
        return sum((line.debit for line in self.lines.all()), Decimal('0.00'))

    @property
    def total_credit(self):
        return sum((line.credit for line in self.lines.all()), Decimal('0.00'))

    def __str__(self):
        return self.entry_number


class JournalLine(UUIDModel):
    journal_entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name='lines')
    account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name='journal_lines')
    description = models.TextField(blank=True)
    debit = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        ordering = ['created_at']

    def clean(self):
        if self.debit and self.credit:
            raise ValueError('A journal line cannot have both debit and credit.')

    def __str__(self):
        return f'{self.account.code} D{self.debit} C{self.credit}'
