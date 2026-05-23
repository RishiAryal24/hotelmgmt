import uuid

from django.db import models
from django_tenants.models import TenantMixin, DomainMixin
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _

from core.models import UUIDModel


class Tenant(TenantMixin, UUIDModel):
    CURRENCY_CHOICES = [
        ('NPR', 'Nepalese Rupee'),
        ('USD', 'US Dollar'),
        ('EUR', 'Euro'),
        ('GBP', 'British Pound'),
        ('INR', 'Indian Rupee'),
        ('AUD', 'Australian Dollar'),
        ('CAD', 'Canadian Dollar'),
        ('SGD', 'Singapore Dollar'),
        ('AED', 'UAE Dirham'),
    ]

    name = models.CharField(max_length=255, unique=True)
    paid_until = models.DateField(null=True, blank=True)
    on_trial = models.BooleanField(default=True)
    created_by = models.CharField(max_length=255, blank=True, default='system')
    description = models.TextField(blank=True)
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='NPR')
    notification_settings = models.JSONField(default=dict, blank=True)
    payment_settings = models.JSONField(default=dict, blank=True)

    auto_create_schema = True

    class Meta:
        verbose_name = _('Tenant')
        verbose_name_plural = _('Tenants')

    def save(self, *args, **kwargs):
        if not self.schema_name:
            self.schema_name = slugify(self.name)
        super().save(*args, **kwargs)


class Domain(DomainMixin, UUIDModel):
    tenant = models.ForeignKey(Tenant, related_name='domains', on_delete=models.CASCADE)

    class Meta:
        verbose_name = _('Tenant Domain')
        verbose_name_plural = _('Tenant Domains')
