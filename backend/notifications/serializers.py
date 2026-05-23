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
    acknowledged_by_details = UserSerializer(source='acknowledged_by', read_only=True)
    resolved_by_details = UserSerializer(source='resolved_by', read_only=True)
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
            'acknowledged_by',
            'acknowledged_at',
            'resolved_by',
            'resolved_at',
        ]


class NotificationWorkflowSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True)


class NotificationDeliveryActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)


class NotificationTestDeliverySerializer(serializers.Serializer):
    channel = serializers.ChoiceField(choices=['email', 'sms', 'whatsapp'])
    recipient_email = serializers.EmailField(required=False, allow_blank=True)
    recipient_phone = serializers.CharField(required=False, allow_blank=True, max_length=40)
    subject = serializers.CharField(required=False, allow_blank=True, max_length=255)
    message = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        channel = attrs['channel']
        if channel == 'email' and not attrs.get('recipient_email'):
            raise serializers.ValidationError({'recipient_email': 'Email test delivery requires a recipient email.'})
        if channel in ['sms', 'whatsapp'] and not attrs.get('recipient_phone'):
            raise serializers.ValidationError({'recipient_phone': f'{channel.upper()} test delivery requires a recipient phone.'})
        if not attrs.get('message'):
            attrs['message'] = f'Test {channel} notification from hotel management.'
        if not attrs.get('subject'):
            attrs['subject'] = 'Notification delivery test'
        return attrs
