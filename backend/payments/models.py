from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import UUIDModel


class PaymentIntent(UUIDModel):
    SOURCE_CHOICES = [
        ('guest_folio', 'Guest Folio'),
        ('restaurant_order', 'Restaurant Order'),
        ('purchase_order', 'Purchase Order'),
        ('manual', 'Manual'),
    ]
    PROVIDER_CHOICES = [
        ('manual', 'Manual'),
        ('mock', 'Mock'),
        ('khalti', 'Khalti'),
        ('esewa', 'eSewa'),
        ('stripe', 'Stripe'),
    ]
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('requires_action', 'Requires Action'),
        ('processing', 'Processing'),
        ('succeeded', 'Succeeded'),
        ('failed', 'Failed'),
        ('canceled', 'Canceled'),
    ]
    SETTLEMENT_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('settled', 'Settled'),
        ('skipped', 'Skipped'),
        ('failed', 'Failed'),
    ]
    FOLLOW_UP_STATUS_CHOICES = [
        ('none', 'None'),
        ('open', 'Open'),
        ('in_review', 'In Review'),
        ('resolved', 'Resolved'),
    ]

    source_module = models.CharField(max_length=40, choices=SOURCE_CHOICES, db_index=True)
    source_id = models.CharField(max_length=80, db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=8, default='NPR')
    provider = models.CharField(max_length=30, choices=PROVIDER_CHOICES, default='manual', db_index=True)
    provider_reference = models.CharField(max_length=160, blank=True, db_index=True)
    idempotency_key = models.CharField(max_length=160, unique=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='draft', db_index=True)
    description = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    callback_payload = models.JSONField(default=dict, blank=True)
    failure_message = models.TextField(blank=True)
    provider_payload = models.JSONField(default=dict, blank=True)
    settlement_status = models.CharField(max_length=20, choices=SETTLEMENT_STATUS_CHOICES, default='pending', db_index=True)
    settlement_message = models.TextField(blank=True)
    settled_at = models.DateTimeField(null=True, blank=True)
    follow_up_status = models.CharField(max_length=20, choices=FOLLOW_UP_STATUS_CHOICES, default='none', db_index=True)
    follow_up_notes = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name='reviewed_payment_intents', null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name='created_payment_intents', null=True, blank=True)
    succeeded_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    canceled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['source_module', 'source_id']),
            models.Index(fields=['provider', 'provider_reference']),
            models.Index(fields=['status', 'created_at']),
        ]

    def __str__(self):
        return f'{self.source_module}:{self.source_id} {self.amount} {self.status}'

    def mark_processing(self, *, provider_reference='', payload=None):
        if self.status == 'succeeded':
            return
        self.status = 'processing'
        if provider_reference:
            self.provider_reference = provider_reference
        if payload is not None:
            self.callback_payload = payload
        self.save(update_fields=['status', 'provider_reference', 'callback_payload', 'updated_at'])

    def mark_succeeded(self, *, provider_reference='', payload=None):
        if self.status == 'succeeded':
            return
        self.status = 'succeeded'
        self.failure_message = ''
        self.succeeded_at = timezone.now()
        if provider_reference:
            self.provider_reference = provider_reference
        if payload is not None:
            self.callback_payload = payload
        self.save(update_fields=['status', 'failure_message', 'succeeded_at', 'provider_reference', 'callback_payload', 'updated_at'])

    def mark_failed(self, message='', *, payload=None):
        if self.status == 'succeeded':
            return
        self.status = 'failed'
        self.failure_message = message
        self.failed_at = timezone.now()
        if payload is not None:
            self.callback_payload = payload
        self.save(update_fields=['status', 'failure_message', 'failed_at', 'callback_payload', 'updated_at'])

    def cancel(self, *, message=''):
        if self.status == 'succeeded':
            raise ValueError('Succeeded payment intents cannot be canceled.')
        if self.status == 'canceled':
            return
        self.status = 'canceled'
        self.failure_message = message
        self.canceled_at = timezone.now()
        self.save(update_fields=['status', 'failure_message', 'canceled_at', 'updated_at'])

    def update_follow_up(self, *, status, notes='', user=None):
        self.follow_up_status = status
        if notes:
            self.follow_up_notes = notes
        if user:
            self.reviewed_by = user
            self.reviewed_at = timezone.now()
        self.save(update_fields=['follow_up_status', 'follow_up_notes', 'reviewed_by', 'reviewed_at', 'updated_at'])
