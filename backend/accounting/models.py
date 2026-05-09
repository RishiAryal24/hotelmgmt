from decimal import Decimal

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

