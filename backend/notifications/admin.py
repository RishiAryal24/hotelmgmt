from django.contrib import admin

from notifications.models import NotificationEvent, NotificationTemplate


@admin.register(NotificationTemplate)
class NotificationTemplateAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'channel', 'is_active', 'updated_at')
    list_filter = ('channel', 'is_active')
    search_fields = ('code', 'name', 'subject_template', 'body_template')


@admin.register(NotificationEvent)
class NotificationEventAdmin(admin.ModelAdmin):
    list_display = ('event_type', 'module', 'channel', 'status', 'recipient_email', 'created_at')
    list_filter = ('channel', 'status', 'priority', 'module')
    search_fields = ('event_type', 'module', 'subject', 'message', 'recipient_email', 'recipient_phone')
    readonly_fields = ('attempts', 'queued_at', 'sent_at', 'failed_at', 'created_at', 'updated_at')
