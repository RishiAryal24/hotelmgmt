from django.db import models
from django.utils import timezone

from bookings.models import Booking, RatePlan, RoomType


class OTAChannel(models.Model):
    PROVIDER_CHOICES = [
        ('zodomus', 'Zodomus'),
        ('booking_com', 'Booking.com'),
        ('expedia', 'Expedia'),
        ('airbnb', 'Airbnb'),
        ('manual', 'Manual / Generic'),
    ]
    SYNC_DIRECTION_CHOICES = [
        ('push', 'Push'),
        ('pull', 'Pull'),
        ('both', 'Push and Pull'),
    ]

    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, unique=True)
    provider = models.CharField(max_length=40, choices=PROVIDER_CHOICES, default='manual')
    api_key = models.CharField(max_length=255, blank=True)
    api_secret = models.CharField(max_length=255, blank=True)
    base_url = models.URLField(blank=True)
    is_active = models.BooleanField(default=True)
    sync_direction = models.CharField(max_length=10, choices=SYNC_DIRECTION_CHOICES, default='both')
    last_sync = models.DateTimeField(null=True, blank=True)
    settings = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    def mark_synced(self):
        self.last_sync = timezone.now()
        self.save(update_fields=['last_sync'])


class OTAChannelRoomTypeMapping(models.Model):
    channel = models.ForeignKey(OTAChannel, on_delete=models.CASCADE, related_name='room_type_mappings')
    room_type = models.ForeignKey(RoomType, on_delete=models.CASCADE, related_name='ota_mappings')
    external_room_type_id = models.CharField(max_length=120)
    external_room_type_name = models.CharField(max_length=160, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['channel__name', 'room_type__name']
        constraints = [
            models.UniqueConstraint(fields=['channel', 'room_type'], name='unique_ota_channel_room_type'),
            models.UniqueConstraint(fields=['channel', 'external_room_type_id'], name='unique_ota_channel_external_room_type'),
        ]

    def __str__(self):
        return f'{self.channel.code}: {self.room_type.code}'


class OTAChannelRatePlanMapping(models.Model):
    channel = models.ForeignKey(OTAChannel, on_delete=models.CASCADE, related_name='rate_plan_mappings')
    rate_plan = models.ForeignKey(RatePlan, on_delete=models.CASCADE, related_name='ota_mappings')
    external_rate_plan_id = models.CharField(max_length=120)
    external_rate_plan_name = models.CharField(max_length=160, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['channel__name', 'rate_plan__name']
        constraints = [
            models.UniqueConstraint(fields=['channel', 'rate_plan'], name='unique_ota_channel_rate_plan'),
            models.UniqueConstraint(fields=['channel', 'external_rate_plan_id'], name='unique_ota_channel_external_rate_plan'),
        ]

    def __str__(self):
        return f'{self.channel.code}: {self.rate_plan.name}'


class OTASyncJob(models.Model):
    STATUS_CHOICES = [
        ('queued', 'Queued'),
        ('running', 'Running'),
        ('succeeded', 'Succeeded'),
        ('failed', 'Failed'),
    ]
    SYNC_TYPE_CHOICES = [
        ('availability_push', 'Availability Push'),
        ('rate_push', 'Rate Push'),
        ('booking_pull', 'Booking Pull'),
        ('webhook', 'Webhook'),
    ]

    channel = models.ForeignKey(OTAChannel, on_delete=models.CASCADE, related_name='sync_jobs')
    sync_type = models.CharField(max_length=40, choices=SYNC_TYPE_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='queued')
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    date_from = models.DateField(null=True, blank=True)
    date_to = models.DateField(null=True, blank=True)
    summary = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['channel', 'sync_type', 'status']),
            models.Index(fields=['created_at']),
        ]

    def mark_running(self):
        self.status = 'running'
        self.started_at = timezone.now()
        self.save(update_fields=['status', 'started_at'])

    def mark_succeeded(self, summary=None):
        self.status = 'succeeded'
        self.completed_at = timezone.now()
        self.summary = summary or {}
        self.error_message = ''
        self.save(update_fields=['status', 'completed_at', 'summary', 'error_message'])
        self.channel.mark_synced()

    def mark_failed(self, error_message):
        self.status = 'failed'
        self.completed_at = timezone.now()
        self.error_message = str(error_message)
        self.save(update_fields=['status', 'completed_at', 'error_message'])


class OTAWebhookEvent(models.Model):
    STATUS_CHOICES = [
        ('received', 'Received'),
        ('processed', 'Processed'),
        ('duplicate', 'Duplicate'),
        ('failed', 'Failed'),
    ]

    channel = models.ForeignKey(OTAChannel, on_delete=models.CASCADE, related_name='webhook_events')
    external_event_id = models.CharField(max_length=160)
    event_type = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='received')
    payload = models.JSONField(default=dict, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['channel', 'external_event_id'], name='unique_ota_webhook_event'),
        ]
        indexes = [
            models.Index(fields=['channel', 'status']),
            models.Index(fields=['event_type']),
        ]

    def mark_processed(self):
        self.status = 'processed'
        self.processed_at = timezone.now()
        self.error_message = ''
        self.save(update_fields=['status', 'processed_at', 'error_message'])

    def mark_failed(self, error_message):
        self.status = 'failed'
        self.processed_at = timezone.now()
        self.error_message = str(error_message)
        self.save(update_fields=['status', 'processed_at', 'error_message'])


class OTAReservationImport(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('conflict', 'Conflict'),
        ('accepted', 'Accepted'),
        ('rejected', 'Rejected'),
        ('canceled', 'Canceled'),
    ]
    CONFLICT_CHOICES = [
        ('none', 'None'),
        ('duplicate', 'Duplicate'),
        ('missing_mapping', 'Missing Mapping'),
        ('no_room_available', 'No Room Available'),
        ('invalid_dates', 'Invalid Dates'),
        ('guest_blacklisted', 'Guest Blacklisted'),
        ('modification_review', 'Modification Review'),
        ('cancellation_review', 'Cancellation Review'),
    ]

    channel = models.ForeignKey(OTAChannel, on_delete=models.CASCADE, related_name='reservation_imports')
    webhook_event = models.ForeignKey(OTAWebhookEvent, on_delete=models.SET_NULL, related_name='reservation_imports', null=True, blank=True)
    booking = models.ForeignKey(Booking, on_delete=models.SET_NULL, related_name='ota_imports', null=True, blank=True)
    external_reservation_id = models.CharField(max_length=160)
    external_room_type_id = models.CharField(max_length=120, blank=True)
    external_rate_plan_id = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    conflict_type = models.CharField(max_length=40, choices=CONFLICT_CHOICES, default='none')
    conflict_message = models.TextField(blank=True)
    guest_first_name = models.CharField(max_length=120, blank=True)
    guest_last_name = models.CharField(max_length=120, blank=True)
    guest_email = models.EmailField(blank=True)
    guest_phone = models.CharField(max_length=40, blank=True)
    check_in_date = models.DateField(null=True, blank=True)
    check_out_date = models.DateField(null=True, blank=True)
    number_of_guests = models.PositiveIntegerField(default=1)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, blank=True)
    raw_payload = models.JSONField(default=dict, blank=True)
    normalized_payload = models.JSONField(default=dict, blank=True)
    reviewed_by = models.ForeignKey('users.PlatformUser', on_delete=models.SET_NULL, related_name='reviewed_ota_imports', null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['channel', 'external_reservation_id'], name='unique_ota_reservation_import'),
        ]
        indexes = [
            models.Index(fields=['channel', 'status']),
            models.Index(fields=['external_reservation_id']),
            models.Index(fields=['check_in_date', 'check_out_date']),
        ]

    def mark_reviewed(self, *, status, user=None, notes=''):
        self.status = status
        self.reviewed_by = user
        self.reviewed_at = timezone.now()
        if notes:
            self.review_notes = notes
        self.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'review_notes', 'updated_at'])
