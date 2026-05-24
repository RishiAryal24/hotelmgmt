from rest_framework import serializers
from bookings.models import (
    Booking,
    DynamicPricingRule,
    FacilityAmenity,
    FacilityService,
    Guest,
    GuestCommunication,
    GuestFolio,
    GuestFolioLine,
    GuestFollowUpReminder,
    GuestPoints,
    LoyaltyProgram,
    Package,
    RatePlan,
    Room,
    RoomType,
)


class FacilityAmenitySerializer(serializers.ModelSerializer):
    class Meta:
        model = FacilityAmenity
        fields = '__all__'


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
    checkout_readiness = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = '__all__'
        read_only_fields = ['total_amount']

    def get_folio_details(self, obj):
        try:
            folio = obj.folio
        except GuestFolio.DoesNotExist:
            return None
        return GuestFolioSerializer(folio).data

    def get_checkout_readiness(self, obj):
        from bookings.services import get_checkout_readiness

        return get_checkout_readiness(obj)

    def validate(self, data):
        room = data.get('room') or getattr(self.instance, 'room', None)
        rate_plan = data.get('rate_plan') or getattr(self.instance, 'rate_plan', None)
        guest = data.get('guest') or getattr(self.instance, 'guest', None)
        check_in_date = data.get('check_in_date') or getattr(self.instance, 'check_in_date', None)
        check_out_date = data.get('check_out_date') or getattr(self.instance, 'check_out_date', None)
        number_of_guests = data.get('number_of_guests') or getattr(self.instance, 'number_of_guests', 1)

        if guest and guest.vip_level == 'blacklist':
            raise serializers.ValidationError("Guest is marked do not book.")
        if check_in_date and check_out_date and check_out_date <= check_in_date:
            raise serializers.ValidationError("Check-out date must be after check-in date.")
        if room and number_of_guests and number_of_guests > room.capacity:
            raise serializers.ValidationError("Number of guests exceeds room capacity.")
        if room and rate_plan and rate_plan.room_type_id != room.room_type_id:
            raise serializers.ValidationError("Rate plan does not apply to this room type.")

        if not room or not check_in_date or not check_out_date:
            return data

        overlapping_bookings = Booking.objects.filter(
            room=room,
            check_in_date__lt=check_out_date,
            check_out_date__gt=check_in_date,
            status__in=['confirmed', 'checked_in'],
        ).exclude(pk=getattr(self.instance, 'pk', None))
        if overlapping_bookings.exists():
            raise serializers.ValidationError("Room is not available for the selected dates.")

        return data


class GuestFolioLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = GuestFolioLine
        fields = '__all__'


class FacilityServiceSerializer(serializers.ModelSerializer):
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    amenity_details = FacilityAmenitySerializer(source='amenity', read_only=True)

    class Meta:
        model = FacilityService
        fields = '__all__'


class GuestFolioChargeSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=255)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    source_module = serializers.CharField(max_length=80, required=False, allow_blank=True)
    facility_service = serializers.PrimaryKeyRelatedField(
        queryset=FacilityService.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )


class GuestFolioSerializer(serializers.ModelSerializer):
    lines = GuestFolioLineSerializer(many=True, read_only=True)
    guest_name = serializers.SerializerMethodField()
    payment_reference = serializers.SerializerMethodField()
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

    def get_payment_reference(self, obj):
        from payments.services import get_settled_payment_reference

        return get_settled_payment_reference(source_module='guest_folio', source_id=obj.id)


class RatePlanSerializer(serializers.ModelSerializer):
    room_type_name = serializers.CharField(source='room_type.name', read_only=True)

    class Meta:
        model = RatePlan
        fields = '__all__'


class DynamicPricingRuleSerializer(serializers.ModelSerializer):
    room_type_name = serializers.CharField(source='room_type.name', read_only=True)
    rate_plan_name = serializers.CharField(source='rate_plan.name', read_only=True)

    class Meta:
        model = DynamicPricingRule
        fields = '__all__'

    def validate(self, attrs):
        valid_from = attrs.get('valid_from', getattr(self.instance, 'valid_from', None))
        valid_to = attrs.get('valid_to', getattr(self.instance, 'valid_to', None))
        min_occupancy = attrs.get('min_occupancy', getattr(self.instance, 'min_occupancy', None))
        max_occupancy = attrs.get('max_occupancy', getattr(self.instance, 'max_occupancy', None))
        days_of_week = attrs.get('days_of_week', getattr(self.instance, 'days_of_week', []))
        if valid_from and valid_to and valid_to < valid_from:
            raise serializers.ValidationError('valid_to must be on or after valid_from.')
        if min_occupancy and max_occupancy and max_occupancy < min_occupancy:
            raise serializers.ValidationError('max_occupancy must be greater than or equal to min_occupancy.')
        if days_of_week:
            if not isinstance(days_of_week, list) or any(int(day) < 0 or int(day) > 6 for day in days_of_week):
                raise serializers.ValidationError('days_of_week must contain weekday numbers from 0 to 6.')
        return attrs


class BookingPriceQuoteSerializer(serializers.Serializer):
    room = serializers.PrimaryKeyRelatedField(queryset=Room.objects.select_related('room_type').all())
    check_in_date = serializers.DateField()
    check_out_date = serializers.DateField()
    rate_plan = serializers.PrimaryKeyRelatedField(queryset=RatePlan.objects.filter(is_active=True), required=False, allow_null=True)
    number_of_guests = serializers.IntegerField(min_value=1, default=1)

    def validate(self, attrs):
        if attrs['check_out_date'] <= attrs['check_in_date']:
            raise serializers.ValidationError('Check-out date must be after check-in date.')
        rate_plan = attrs.get('rate_plan')
        room = attrs['room']
        if rate_plan and rate_plan.room_type_id != room.room_type_id:
            raise serializers.ValidationError('Rate plan does not apply to this room type.')
        return attrs


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


class GuestFollowUpReminderSerializer(serializers.ModelSerializer):
    guest_details = GuestSerializer(source='guest', read_only=True)
    booking_details = BookingSerializer(source='booking', read_only=True)
    assigned_to_email = serializers.EmailField(source='assigned_to.email', read_only=True)
    created_by_email = serializers.EmailField(source='created_by.email', read_only=True)

    class Meta:
        model = GuestFollowUpReminder
        fields = '__all__'
        read_only_fields = ['completed_at', 'canceled_at', 'created_by']


class GuestFollowUpActionSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True)
    snoozed_until = serializers.DateTimeField(required=False)
