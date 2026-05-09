from django.utils import timezone
from rest_framework import serializers

from bookings.serializers import RoomSerializer
from housekeeping.models import HousekeepingTask
from users.serializers import UserSerializer


class HousekeepingTaskSerializer(serializers.ModelSerializer):
    room_details = RoomSerializer(source='room', read_only=True)
    assigned_to_details = UserSerializer(source='assigned_to', read_only=True)

    class Meta:
        model = HousekeepingTask
        fields = '__all__'

    def update(self, instance, validated_data):
        status = validated_data.get('status')
        if status == 'done' and instance.status != 'done':
            validated_data['completed_at'] = timezone.now()
            instance.room.status = 'available'
            instance.room.save(update_fields=['status', 'updated_at'])
        return super().update(instance, validated_data)

