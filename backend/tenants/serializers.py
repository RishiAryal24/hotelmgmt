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

    class Meta:
        model = Tenant
        fields = ['id', 'name', 'schema_name', 'currency', 'currency_choices']
        read_only_fields = ['id', 'name', 'schema_name', 'currency_choices']

    def get_currency_choices(self, obj):
        return [{'code': code, 'name': name} for code, name in Tenant.CURRENCY_CHOICES]
