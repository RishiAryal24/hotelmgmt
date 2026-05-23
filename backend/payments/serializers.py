from rest_framework import serializers

from payments.models import PaymentIntent
from payments.services import PaymentIntentError, create_payment_intent
from users.serializers import UserSerializer


class PaymentIntentSerializer(serializers.ModelSerializer):
    created_by_details = UserSerializer(source='created_by', read_only=True)

    class Meta:
        model = PaymentIntent
        fields = '__all__'
        read_only_fields = [
            'status',
            'callback_payload',
            'failure_message',
            'created_by',
            'settlement_status',
            'settlement_message',
            'settled_at',
            'succeeded_at',
            'failed_at',
            'canceled_at',
        ]


class PaymentIntentCreateSerializer(serializers.Serializer):
    source_module = serializers.ChoiceField(choices=PaymentIntent.SOURCE_CHOICES)
    source_id = serializers.CharField(max_length=80)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    currency = serializers.CharField(max_length=8, default='NPR')
    provider = serializers.ChoiceField(choices=PaymentIntent.PROVIDER_CHOICES, default='manual')
    idempotency_key = serializers.CharField(max_length=160)
    description = serializers.CharField(max_length=255, required=False, allow_blank=True)
    metadata = serializers.JSONField(required=False)

    def create(self, validated_data):
        try:
            return create_payment_intent(created_by=self.context['request'].user, **validated_data)
        except PaymentIntentError as exc:
            raise serializers.ValidationError({'detail': str(exc)}) from exc


class PaymentIntentActionSerializer(serializers.Serializer):
    provider_reference = serializers.CharField(max_length=160, required=False, allow_blank=True)
    message = serializers.CharField(required=False, allow_blank=True)
    payload = serializers.JSONField(required=False)


class PaymentInitiateSerializer(serializers.Serializer):
    customer_info = serializers.JSONField(required=False)
    payment_method = serializers.CharField(required=False, allow_blank=True)


class EsewaVerifySerializer(serializers.Serializer):
    encoded_data = serializers.CharField(required=False, allow_blank=True)
    payload = serializers.JSONField(required=False)


class PaymentProviderCallbackSerializer(serializers.Serializer):
    provider = serializers.ChoiceField(choices=PaymentIntent.PROVIDER_CHOICES)
    provider_reference = serializers.CharField(max_length=160, required=False, allow_blank=True)
    idempotency_key = serializers.CharField(max_length=160, required=False, allow_blank=True)
    status = serializers.CharField(max_length=30)
    payload = serializers.JSONField(required=False)

    def validate(self, attrs):
        if not attrs.get('provider_reference') and not attrs.get('idempotency_key'):
            raise serializers.ValidationError('Provider reference or idempotency key is required.')
        return attrs


class PaymentFollowUpSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=['open', 'in_review', 'resolved'])
    notes = serializers.CharField(required=False, allow_blank=True)
