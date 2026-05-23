from rest_framework import serializers

from tenants.models import Tenant


class TenantCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    domain_name = serializers.CharField(max_length=255)
    currency = serializers.ChoiceField(choices=Tenant.CURRENCY_CHOICES, default='NPR')
    admin_email = serializers.EmailField()
    admin_password = serializers.CharField(min_length=12, write_only=True)

    def create(self, validated_data):
        from tenants.services import create_tenant_workspace

        return create_tenant_workspace(
            name=validated_data['name'],
            domain_name=validated_data['domain_name'],
            currency=validated_data.get('currency', 'NPR'),
            admin_email=validated_data['admin_email'],
            admin_password=validated_data['admin_password'],
            created_by=self.context['request'].user.email if self.context.get('request') and hasattr(self.context['request'], 'user') else 'system',
        )


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = ['id', 'name', 'schema_name', 'paid_until', 'on_trial', 'created_by', 'description', 'currency']


class TenantSettingsSerializer(serializers.ModelSerializer):
    currency_choices = serializers.SerializerMethodField()
    notification_settings = serializers.SerializerMethodField()
    payment_settings = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = ['id', 'name', 'schema_name', 'currency', 'currency_choices', 'notification_settings', 'payment_settings']
        read_only_fields = ['id', 'name', 'schema_name', 'currency_choices']

    def get_currency_choices(self, obj):
        return [{'code': code, 'name': name} for code, name in Tenant.CURRENCY_CHOICES]

    def _masked_settings(self, settings, secret_fields):
        masked = {}
        for provider, values in (settings or {}).items():
            if not isinstance(values, dict):
                continue
            provider_values = values.copy()
            for secret_field in secret_fields:
                if provider_values.get(secret_field):
                    provider_values[secret_field] = '********'
            masked[provider] = provider_values
        return masked

    def get_notification_settings(self, obj):
        return self._masked_settings(obj.notification_settings, ['auth_token', 'api_key', 'secret_key', 'access_token'])

    def get_payment_settings(self, obj):
        return self._masked_settings(obj.payment_settings, ['secret_key', 'client_secret', 'api_key'])

    def _merge_settings(self, current, incoming, secret_fields):
        merged = (current or {}).copy()
        for provider, values in incoming.items():
            if not isinstance(values, dict):
                continue
            provider_values = (merged.get(provider) or {}).copy()
            for key, value in values.items():
                if key in secret_fields and value == '********':
                    continue
                provider_values[key] = value
            merged[provider] = provider_values
        return merged

    def update(self, instance, validated_data):
        request_data = getattr(self, 'initial_data', {})
        notification_settings = request_data.get('notification_settings')
        if isinstance(notification_settings, dict):
            instance.notification_settings = self._merge_settings(
                instance.notification_settings,
                notification_settings,
                ['auth_token', 'api_key', 'secret_key', 'access_token'],
            )
        payment_settings = request_data.get('payment_settings')
        if isinstance(payment_settings, dict):
            instance.payment_settings = self._merge_settings(
                instance.payment_settings,
                payment_settings,
                ['secret_key', 'client_secret', 'api_key'],
            )
        return super().update(instance, validated_data)
