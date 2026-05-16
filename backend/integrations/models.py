from django.db import models
from django_tenants.models import TenantMixin


class OTAChannel(TenantMixin):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, unique=True)
    api_key = models.CharField(max_length=255)
    api_secret = models.CharField(max_length=255)
    base_url = models.URLField()
    is_active = models.BooleanField(default=True)
    last_sync = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.name
