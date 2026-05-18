from decimal import Decimal

from rest_framework import serializers

from inventory.serializers import InventoryItemSerializer
from restaurant.models import (
    CashierCounter,
    CashierShift,
    KitchenTicket,
    KitchenTicketLine,
    MenuCategory,
    MenuItem,
    RestaurantOrder,
    RestaurantOrderLine,
    RestaurantTable,
)


class MenuCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuCategory
        fields = '__all__'


class MenuItemSerializer(serializers.ModelSerializer):
    category_details = MenuCategorySerializer(source='category', read_only=True)
    inventory_item_details = InventoryItemSerializer(source='inventory_item', read_only=True)

    class Meta:
        model = MenuItem
        fields = '__all__'


class RestaurantTableSerializer(serializers.ModelSerializer):
    class Meta:
        model = RestaurantTable
        fields = '__all__'


class RestaurantOrderLineSerializer(serializers.ModelSerializer):
    menu_item_details = MenuItemSerializer(source='menu_item', read_only=True)

    class Meta:
        model = RestaurantOrderLine
        fields = '__all__'
        read_only_fields = ['unit_price', 'line_total']

    def create(self, validated_data):
        validated_data['unit_price'] = validated_data['menu_item'].price
        return super().create(validated_data)


class SplitBillLineSerializer(serializers.Serializer):
    line = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class SplitBillSerializer(serializers.Serializer):
    lines = SplitBillLineSerializer(many=True)


class TransferTableSerializer(serializers.Serializer):
    table = serializers.PrimaryKeyRelatedField(queryset=RestaurantTable.objects.all())


class VoidOrderLineSerializer(serializers.Serializer):
    line = serializers.PrimaryKeyRelatedField(queryset=RestaurantOrderLine.objects.all())
    reason = serializers.CharField(required=False, allow_blank=True)


class ApplyOrderDiscountSerializer(serializers.Serializer):
    discount_amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.00'))
    reason = serializers.CharField(required=False, allow_blank=True)


class CashierShiftSerializer(serializers.ModelSerializer):
    counter_details = serializers.SerializerMethodField()
    cashier_email = serializers.EmailField(source='cashier.email', read_only=True)
    live_totals = serializers.SerializerMethodField()

    class Meta:
        model = CashierShift
        fields = '__all__'
        read_only_fields = [
            'cashier',
            'expected_cash',
            'expected_card',
            'expected_wallet',
            'expected_bank_transfer',
            'expected_room_posting',
            'expected_total',
            'actual_cash',
            'cash_variance',
            'opened_at',
            'closed_at',
            'status',
        ]

    def get_live_totals(self, obj):
        from restaurant.services import calculate_cashier_shift_totals

        return calculate_cashier_shift_totals(obj)

    def get_counter_details(self, obj):
        return CashierCounterSerializer(obj.counter).data


class CashierCounterSerializer(serializers.ModelSerializer):
    class Meta:
        model = CashierCounter
        fields = '__all__'


class CashierShiftOpenSerializer(serializers.Serializer):
    counter = serializers.PrimaryKeyRelatedField(queryset=CashierCounter.objects.filter(is_active=True))
    opening_cash = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.00'))
    business_date = serializers.DateField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)


class CashierShiftCloseSerializer(serializers.Serializer):
    actual_cash = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.00'))
    notes = serializers.CharField(required=False, allow_blank=True)


class RestaurantOrderSerializer(serializers.ModelSerializer):
    table_details = RestaurantTableSerializer(source='table', read_only=True)
    lines = RestaurantOrderLineSerializer(many=True, read_only=True)
    room_number = serializers.CharField(source='room_booking.room.room_number', read_only=True)
    guest_name = serializers.SerializerMethodField()

    class Meta:
        model = RestaurantOrder
        fields = '__all__'
        read_only_fields = ['order_number', 'subtotal', 'grand_total', 'paid_amount', 'payment_method', 'paid_at', 'waiter']

    def get_guest_name(self, obj):
        if not obj.room_booking_id:
            return ''
        return str(obj.room_booking.guest)


class KitchenTicketLineSerializer(serializers.ModelSerializer):
    order_line_details = RestaurantOrderLineSerializer(source='order_line', read_only=True)

    class Meta:
        model = KitchenTicketLine
        fields = '__all__'


class KitchenTicketSerializer(serializers.ModelSerializer):
    order_details = RestaurantOrderSerializer(source='order', read_only=True)
    lines = KitchenTicketLineSerializer(many=True, read_only=True)

    class Meta:
        model = KitchenTicket
        fields = '__all__'
        read_only_fields = ['ticket_number']
