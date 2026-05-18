from rest_framework import serializers
from bookings.models import (
    Booking,
    Guest,
    GuestCommunication,
    GuestFolio,
    GuestFolioLine,
    GuestPoints,
    LoyaltyProgram,
    Package,
    RatePlan,
    Room,
    RoomType,
)


class RoomTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoomType
        fields = '__all__'


class RoomSerializer(serializers.ModelSerializer):
    room_type_details = RoomTypeSerializer(source='room_type', read_only=True)
    room_type_name = serializers.CharField(source='room_type.name', read_only=True)

    class Meta:
        model = Room
        fields = '__all__'


class GuestSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = Guest
        fields = '__all__'

    def get_full_name(self, obj):
        return str(obj)


class BookingSerializer(serializers.ModelSerializer):
    room_details = RoomSerializer(source='room', read_only=True)
    guest_details = GuestSerializer(source='guest', read_only=True)
    folio_details = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = '__all__'
        read_only_fields = ['total_amount']

    def get_folio_details(self, obj):
        folio = getattr(obj, 'folio', None)
        if not folio:
            return None
        return GuestFolioSerializer(folio).data

    def validate(self, data):
        # Validate check-in and check-out dates
        if data['check_out_date'] <= data['check_in_date']:
            raise serializers.ValidationError("Check-out date must be after check-in date.")

        # Check room availability (basic check - can be enhanced)
        overlapping_bookings = Booking.objects.filter(
            room=data['room'],
            check_in_date__lt=data['check_out_date'],
            check_out_date__gt=data['check_in_date'],
            status__in=['confirmed', 'checked_in']
        ).exclude(pk=getattr(self.instance, 'pk', None))

        if overlapping_bookings.exists():
            raise serializers.ValidationError("Room is not available for the selected dates.")

        return data


class GuestFolioLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = GuestFolioLine
        fields = '__all__'


class GuestFolioChargeSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=255)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    source_module = serializers.CharField(max_length=80, required=False, allow_blank=True)


class GuestFolioSerializer(serializers.ModelSerializer):
    lines = GuestFolioLineSerializer(many=True, read_only=True)
    guest_name = serializers.SerializerMethodField()
    room_number = serializers.CharField(source='booking.room.room_number', read_only=True)
    booking_status = serializers.CharField(source='booking.status', read_only=True)
    check_in_date = serializers.DateField(source='booking.check_in_date', read_only=True)
    check_out_date = serializers.DateField(source='booking.check_out_date', read_only=True)

    class Meta:
        model = GuestFolio
        fields = '__all__'
        read_only_fields = [
            'folio_number',
            'subtotal',
            'tax_total',
            'service_charge_total',
            'grand_total',
            'status',
            'payment_method',
            'paid_amount',
            'paid_at',
        ]

    def get_guest_name(self, obj):
        return str(obj.booking.guest)


class RatePlanSerializer(serializers.ModelSerializer):
    room_type_name = serializers.CharField(source='room_type.name', read_only=True)

    class Meta:
        model = RatePlan
        fields = '__all__'


class PackageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Package
        fields = '__all__'


class LoyaltyProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyProgram
        fields = '__all__'


class GuestPointsSerializer(serializers.ModelSerializer):
    guest_name = serializers.CharField(source='guest.__str__', read_only=True)

    class Meta:
        model = GuestPoints
        fields = '__all__'


class GuestCommunicationSerializer(serializers.ModelSerializer):
    guest_name = serializers.CharField(source='guest.__str__', read_only=True)
    booking_reference = serializers.SerializerMethodField()
    created_by_email = serializers.EmailField(source='created_by.email', read_only=True)

    class Meta:
        model = GuestCommunication
        fields = '__all__'
        read_only_fields = ['created_by']

    def get_booking_reference(self, obj):
        if not obj.booking_id:
            return ''
        room_number = getattr(getattr(obj.booking, 'room', None), 'room_number', '')
        return f"{obj.booking.check_in_date} - Room {room_number}" if room_number else str(obj.booking_id)
