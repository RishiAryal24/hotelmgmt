# Generated manually for the notifications foundation.

import uuid

import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='NotificationTemplate',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('code', models.SlugField(max_length=120, unique=True)),
                ('name', models.CharField(max_length=160)),
                ('channel', models.CharField(choices=[('email', 'Email'), ('sms', 'SMS'), ('whatsapp', 'WhatsApp'), ('in_app', 'In App')], default='email', max_length=20)),
                ('subject_template', models.CharField(blank=True, max_length=255)),
                ('body_template', models.TextField()),
                ('is_active', models.BooleanField(default=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
            ],
            options={
                'ordering': ['code'],
            },
        ),
        migrations.CreateModel(
            name='NotificationEvent',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('channel', models.CharField(choices=[('email', 'Email'), ('sms', 'SMS'), ('whatsapp', 'WhatsApp'), ('in_app', 'In App'), ('system', 'System')], max_length=20)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('queued', 'Queued'), ('sending', 'Sending'), ('sent', 'Sent'), ('failed', 'Failed'), ('canceled', 'Canceled')], db_index=True, default='pending', max_length=20)),
                ('priority', models.CharField(choices=[('low', 'Low'), ('normal', 'Normal'), ('high', 'High'), ('urgent', 'Urgent')], default='normal', max_length=20)),
                ('event_type', models.CharField(db_index=True, max_length=120)),
                ('module', models.CharField(db_index=True, max_length=80)),
                ('subject', models.CharField(blank=True, max_length=255)),
                ('message', models.TextField(blank=True)),
                ('recipient_email', models.EmailField(blank=True, max_length=254)),
                ('recipient_phone', models.CharField(blank=True, max_length=40)),
                ('payload', models.JSONField(blank=True, default=dict)),
                ('provider', models.CharField(blank=True, max_length=80)),
                ('provider_message_id', models.CharField(blank=True, max_length=160)),
                ('error_message', models.TextField(blank=True)),
                ('attempts', models.PositiveIntegerField(default=0)),
                ('next_retry_at', models.DateTimeField(blank=True, null=True)),
                ('queued_at', models.DateTimeField(blank=True, null=True)),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('failed_at', models.DateTimeField(blank=True, null=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_notification_events', to=settings.AUTH_USER_MODEL)),
                ('recipient_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='notification_events', to=settings.AUTH_USER_MODEL)),
                ('template', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='events', to='notifications.notificationtemplate')),
            ],
            options={
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['status', 'channel'], name='notificatio_status_5d6011_idx'),
                    models.Index(fields=['module', 'event_type'], name='notificatio_module_46ac01_idx'),
                    models.Index(fields=['created_at'], name='notificatio_created_07fd57_idx'),
                ],
            },
        ),
    ]
