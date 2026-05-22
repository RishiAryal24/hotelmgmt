from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import UUIDModel


class NotificationTemplate(UUIDModel):
    CHANNEL_CHOICES = [
        ('email', 'Email'),
        ('sms', 'SMS'),
        ('whatsapp', 'WhatsApp'),
        ('in_app', 'In App'),
    ]

    code = models.SlugField(max_length=120, unique=True)
    name = models.CharField(max_length=160)
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES, default='email')
    subject_template = models.CharField(max_length=255, blank=True)
    body_template = models.TextField()
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['code']

    def __str__(self):
        return f'{self.code} ({self.channel})'


class NotificationEvent(UUIDModel):
    CHANNEL_CHOICES = [
        ('email', 'Email'),
        ('sms', 'SMS'),
        ('whatsapp', 'WhatsApp'),
        ('in_app', 'In App'),
        ('system', 'System'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('queued', 'Queued'),
        ('sending', 'Sending'),
        ('sent', 'Sent'),
        ('failed', 'Failed'),
        ('canceled', 'Canceled'),
    ]
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]

    template = models.ForeignKey(NotificationTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name='events')
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', db_index=True)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='normal')
    event_type = models.CharField(max_length=120, db_index=True)
    module = models.CharField(max_length=80, db_index=True)
    subject = models.CharField(max_length=255, blank=True)
    message = models.TextField(blank=True)
    recipient_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='notification_events')
    recipient_email = models.EmailField(blank=True)
    recipient_phone = models.CharField(max_length=40, blank=True)
    payload = models.JSONField(default=dict, blank=True)
    provider = models.CharField(max_length=80, blank=True)
    provider_message_id = models.CharField(max_length=160, blank=True)
    error_message = models.TextField(blank=True)
    attempts = models.PositiveIntegerField(default=0)
    next_retry_at = models.DateTimeField(null=True, blank=True)
    queued_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_notification_events')

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'channel']),
            models.Index(fields=['module', 'event_type']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f'{self.channel} {self.event_type} {self.status}'

    def mark_queued(self):
        self.status = 'queued'
        self.queued_at = timezone.now()
        self.save(update_fields=['status', 'queued_at', 'updated_at'])

    def mark_sending(self):
        self.status = 'sending'
        self.attempts += 1
        self.save(update_fields=['status', 'attempts', 'updated_at'])

    def mark_sent(self, *, provider='', provider_message_id=''):
        self.status = 'sent'
        self.sent_at = timezone.now()
        self.error_message = ''
        if provider:
            self.provider = provider
        if provider_message_id:
            self.provider_message_id = provider_message_id
        self.save(update_fields=['status', 'sent_at', 'error_message', 'provider', 'provider_message_id', 'updated_at'])

    def mark_failed(self, error_message, *, next_retry_at=None):
        self.status = 'failed'
        self.failed_at = timezone.now()
        self.error_message = str(error_message)
        self.next_retry_at = next_retry_at
        self.save(update_fields=['status', 'failed_at', 'error_message', 'next_retry_at', 'updated_at'])
