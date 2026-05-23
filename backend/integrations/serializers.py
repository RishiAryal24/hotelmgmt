from rest_framework import serializers
from integrations.models import OTAChannel, OTAChannelRatePlanMapping, OTAChannelRoomTypeMapping, OTAReservationImport, OTASyncJob, OTAWebhookEvent


class OTAChannelSerializer(serializers.ModelSerializer):
    room_type_mapping_count = serializers.SerializerMethodField()
    rate_plan_mapping_count = serializers.SerializerMethodField()

    class Meta:
        model = OTAChannel
        fields = '__all__'
        extra_kwargs = {
            'api_key': {'write_only': True},
            'api_secret': {'write_only': True},
        }

    def validate(self, attrs):
        for key in ['name', 'code', 'api_key', 'api_secret', 'base_url']:
            if key in attrs and isinstance(attrs[key], str):
                attrs[key] = attrs[key].strip()
        settings = attrs.get('settings')
        if isinstance(settings, dict):
            normalized_settings = dict(settings)
            for key in ['property_id', 'channel_code', 'hotel_id', 'external_property_id']:
                if isinstance(normalized_settings.get(key), str):
                    normalized_settings[key] = normalized_settings[key].strip()
            attrs['settings'] = normalized_settings
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.api_key:
            data['api_key_configured'] = True
        if instance.api_secret:
            data['api_secret_configured'] = True
        return data

    def get_room_type_mapping_count(self, obj):
        return obj.room_type_mappings.count()

    def get_rate_plan_mapping_count(self, obj):
        return obj.rate_plan_mappings.count()


class OTAChannelRoomTypeMappingSerializer(serializers.ModelSerializer):
    room_type_name = serializers.CharField(source='room_type.name', read_only=True)
    room_type_code = serializers.CharField(source='room_type.code', read_only=True)
    channel_code = serializers.CharField(source='channel.code', read_only=True)

    class Meta:
        model = OTAChannelRoomTypeMapping
        fields = '__all__'


class OTAChannelRatePlanMappingSerializer(serializers.ModelSerializer):
    rate_plan_name = serializers.CharField(source='rate_plan.name', read_only=True)
    room_type_code = serializers.CharField(source='rate_plan.room_type.code', read_only=True)
    channel_code = serializers.CharField(source='channel.code', read_only=True)

    class Meta:
        model = OTAChannelRatePlanMapping
        fields = '__all__'


class OTASyncJobSerializer(serializers.ModelSerializer):
    channel_name = serializers.CharField(source='channel.name', read_only=True)
    channel_code = serializers.CharField(source='channel.code', read_only=True)

    class Meta:
        model = OTASyncJob
        fields = '__all__'
        read_only_fields = ['status', 'started_at', 'completed_at', 'summary', 'error_message', 'created_at']


class OTAWebhookEventSerializer(serializers.ModelSerializer):
    channel_name = serializers.CharField(source='channel.name', read_only=True)
    channel_code = serializers.CharField(source='channel.code', read_only=True)

    class Meta:
        model = OTAWebhookEvent
        fields = '__all__'
        read_only_fields = ['status', 'processed_at', 'error_message', 'created_at']


class OTAReservationImportSerializer(serializers.ModelSerializer):
    channel_name = serializers.CharField(source='channel.name', read_only=True)
    channel_code = serializers.CharField(source='channel.code', read_only=True)
    booking_reference = serializers.CharField(source='booking.id', read_only=True)
    reviewed_by_email = serializers.EmailField(source='reviewed_by.email', read_only=True)

    class Meta:
        model = OTAReservationImport
        fields = '__all__'
        read_only_fields = ['status', 'conflict_type', 'conflict_message', 'booking', 'reviewed_by', 'reviewed_at', 'created_at', 'updated_at']


class OTAReservationReviewSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True)


class OTASyncRequestSerializer(serializers.Serializer):
    date_from = serializers.DateField()
    date_to = serializers.DateField()

    def validate(self, attrs):
        if attrs['date_to'] <= attrs['date_from']:
            raise serializers.ValidationError({'date_to': 'End date must be after start date.'})
        if (attrs['date_to'] - attrs['date_from']).days > 370:
            raise serializers.ValidationError({'date_to': 'Sync range cannot exceed 370 days.'})
        return attrs


class OTAConnectionCheckSerializer(serializers.Serializer):
    provider_response = serializers.JSONField(read_only=True)


class ZodomusTestReservationSerializer(serializers.Serializer):
    external_room_type_id = serializers.CharField(required=False, allow_blank=True, max_length=120)
    external_rate_plan_id = serializers.CharField(required=False, allow_blank=True, max_length=120)
    check_in_date = serializers.DateField()
    check_out_date = serializers.DateField()
    guest_first_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    guest_last_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    guest_email = serializers.EmailField(required=False, allow_blank=True)
    total_amount = serializers.DecimalField(required=False, max_digits=12, decimal_places=2)

    def validate(self, attrs):
        if attrs['check_out_date'] <= attrs['check_in_date']:
            raise serializers.ValidationError({'check_out_date': 'Check-out date must be after check-in date.'})
        return attrs
