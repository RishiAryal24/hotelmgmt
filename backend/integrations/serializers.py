from rest_framework import serializers
from integrations.models import OTAChannel


class OTAChannelSerializer(serializers.ModelSerializer):
    class Meta:
        model = OTAChannel
        fields = '__all__'
        extra_kwargs = {
            'api_key': {'write_only': True},
            'api_secret': {'write_only': True},
        }