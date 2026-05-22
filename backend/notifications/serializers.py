from rest_framework import serializers

from notifications.models import NotificationEvent, NotificationTemplate
from users.serializers import UserSerializer


class NotificationTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationTemplate
        fields = '__all__'


class NotificationEventSerializer(serializers.ModelSerializer):
    recipient_user_details = UserSerializer(source='recipient_user', read_only=True)
    created_by_details = UserSerializer(source='created_by', read_only=True)
    template_details = NotificationTemplateSerializer(source='template', read_only=True)

    class Meta:
        model = NotificationEvent
        fields = '__all__'
        read_only_fields = [
            'status',
            'provider',
            'provider_message_id',
            'error_message',
            'attempts',
            'next_retry_at',
            'queued_at',
            'sent_at',
            'failed_at',
        ]
