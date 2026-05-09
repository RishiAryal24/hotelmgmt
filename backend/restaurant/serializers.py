from rest_framework import serializers

from restaurant.models import (
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
