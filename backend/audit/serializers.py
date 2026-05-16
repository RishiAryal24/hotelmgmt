from rest_framework import serializers

from audit.models import AuditLog
from users.serializers import UserSerializer


class AuditLogSerializer(serializers.ModelSerializer):
    actor_details = UserSerializer(source='actor', read_only=True)

    class Meta:
        model = AuditLog
        fields = '__all__'

