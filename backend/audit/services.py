from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from django.db.models.fields.files import FieldFile
from django.utils.timezone import is_aware

from audit.context import get_current_request, get_current_user
from audit.models import AuditLog


def serialize_value(value):
    if isinstance(value, FieldFile):
        return value.name or ''
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat() if is_aware(value) else value.replace(microsecond=0).isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if hasattr(value, 'pk'):
        return str(value.pk)
    return value


def log_audit_event(*, action, instance, changes=None, actor=None, metadata=None):
    actor = actor or get_current_user()
    request = get_current_request()
    request_metadata = {}
    if request:
        request_metadata = {
            'path': request.path,
            'method': request.method,
            'ip_address': request.META.get('HTTP_X_FORWARDED_FOR', request.META.get('REMOTE_ADDR', '')).split(',')[0],
        }

    AuditLog.objects.create(
        actor=actor,
        actor_email=getattr(actor, 'email', '') or '',
        action=action,
        module=instance._meta.app_label,
        object_type=instance._meta.label,
        object_id=str(instance.pk),
        object_repr=str(instance)[:255],
        changes=changes or {},
        metadata={**request_metadata, **(metadata or {})},
    )
