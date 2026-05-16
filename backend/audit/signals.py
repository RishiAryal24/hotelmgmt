from django.apps import apps
from django.db.models.signals import post_delete, post_save, pre_save

from audit.models import AuditLog
from audit.services import log_audit_event, serialize_value


AUDITED_APPS = {'accounting', 'bookings', 'housekeeping', 'hrms', 'inventory', 'maintenance', 'restaurant'}
IGNORED_FIELDS = {'created_at', 'updated_at'}


def should_audit(model):
    return model is not AuditLog and model._meta.app_label in AUDITED_APPS


def model_snapshot(instance):
    snapshot = {}
    for field in instance._meta.fields:
        if field.name in IGNORED_FIELDS:
            continue
        snapshot[field.name] = serialize_value(getattr(instance, field.name))
    return snapshot


def capture_previous_state(sender, instance, **kwargs):
    if not should_audit(sender) or not instance.pk:
        return
    try:
        previous = sender.objects.get(pk=instance.pk)
    except sender.DoesNotExist:
        return
    instance._audit_previous_state = model_snapshot(previous)


def log_save(sender, instance, created, **kwargs):
    if not should_audit(sender):
        return

    if created:
        changes = {'after': model_snapshot(instance)}
        log_audit_event(action='create', instance=instance, changes=changes)
        return

    previous = getattr(instance, '_audit_previous_state', {})
    current = model_snapshot(instance)
    changed = {
        field: {'before': previous.get(field), 'after': current.get(field)}
        for field in current
        if previous.get(field) != current.get(field)
    }
    if changed:
        log_audit_event(action='update', instance=instance, changes=changed)


def log_delete(sender, instance, **kwargs):
    if not should_audit(sender):
        return
    log_audit_event(action='delete', instance=instance, changes={'before': model_snapshot(instance)})


def connect_all_models():
    for model in apps.get_models():
        if should_audit(model):
            pre_save.connect(capture_previous_state, sender=model, weak=False, dispatch_uid=f'audit-pre-{model._meta.label_lower}')
            post_save.connect(log_save, sender=model, weak=False, dispatch_uid=f'audit-post-{model._meta.label_lower}')
            post_delete.connect(log_delete, sender=model, weak=False, dispatch_uid=f'audit-delete-{model._meta.label_lower}')
