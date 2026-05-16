from rest_framework import serializers

from bookings.serializers import RoomSerializer
from maintenance.models import MaintenanceTicket
from maintenance.services import create_maintenance_ticket
from users.serializers import UserSerializer


class MaintenanceTicketSerializer(serializers.ModelSerializer):
    room_details = RoomSerializer(source='room', read_only=True)
    reported_by_details = UserSerializer(source='reported_by', read_only=True)
    assigned_to_details = UserSerializer(source='assigned_to', read_only=True)

    class Meta:
        model = MaintenanceTicket
        fields = '__all__'
        read_only_fields = ['status', 'reported_by', 'started_at', 'resolved_at', 'closed_at', 'resolution_notes']

    def create(self, validated_data):
        request = self.context.get('request')
        return create_maintenance_ticket(
            reported_by=request.user if request and request.user.is_authenticated else None,
            **validated_data,
        )

