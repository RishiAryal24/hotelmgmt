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
    MenuModifier,
    MenuModifierGroup,
    MenuRecipeIngredient,
    RestaurantOrder,
    RestaurantOrderApproval,
    RestaurantOrderLine,
    RestaurantOrderPayment,
    RestaurantTable,
)


class MenuCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MenuCategory
        fields = '__all__'


class MenuModifierSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source='group.name', read_only=True)

    class Meta:
        model = MenuModifier
        fields = '__all__'


class MenuModifierGroupSerializer(serializers.ModelSerializer):
    modifiers = MenuModifierSerializer(many=True, read_only=True)

    class Meta:
        model = MenuModifierGroup
        fields = '__all__'


class MenuRecipeIngredientSerializer(serializers.ModelSerializer):
    item_details = InventoryItemSerializer(source='item', read_only=True)
    line_cost = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = MenuRecipeIngredient
        fields = '__all__'


class MenuItemSerializer(serializers.ModelSerializer):
    category_details = MenuCategorySerializer(source='category', read_only=True)
    inventory_item_details = InventoryItemSerializer(source='inventory_item', read_only=True)
    modifier_groups_details = MenuModifierGroupSerializer(source='modifier_groups', many=True, read_only=True)
    recipe_ingredients = MenuRecipeIngredientSerializer(many=True, read_only=True)
    recipe_cost = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    gross_margin = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    gross_margin_percent = serializers.DecimalField(max_digits=7, decimal_places=2, read_only=True)

    class Meta:
        model = MenuItem
        fields = '__all__'


class RestaurantTableSerializer(serializers.ModelSerializer):
    class Meta:
        model = RestaurantTable
        fields = '__all__'


class RestaurantOrderLineSerializer(serializers.ModelSerializer):
    menu_item_details = MenuItemSerializer(source='menu_item', read_only=True)
    modifier_details = MenuModifierSerializer(source='modifiers', many=True, read_only=True)
    modifiers = serializers.PrimaryKeyRelatedField(queryset=MenuModifier.objects.filter(is_active=True), many=True, required=False)

    class Meta:
        model = RestaurantOrderLine
        fields = '__all__'
        read_only_fields = ['unit_price', 'line_total']

    def validate(self, attrs):
        menu_item = attrs.get('menu_item') or getattr(self.instance, 'menu_item', None)
        modifiers = attrs.get('modifiers', [])
        if not menu_item:
            return attrs

        item_groups = list(menu_item.modifier_groups.filter(is_active=True).prefetch_related('modifiers'))
        item_group_ids = {group.id for group in item_groups}
        selected_by_group = {}
        for modifier in modifiers:
            if modifier.group_id not in item_group_ids:
                raise serializers.ValidationError('Selected modifier is not available for this menu item.')
            selected_by_group.setdefault(modifier.group_id, []).append(modifier)

        for group in item_groups:
            selected = selected_by_group.get(group.id, [])
            if group.is_required and not selected:
                raise serializers.ValidationError(f'Select a modifier for {group.name}.')
            if group.selection_type == 'single' and len(selected) > 1:
                raise serializers.ValidationError(f'Select only one modifier for {group.name}.')

        return attrs

    def create(self, validated_data):
        modifiers = validated_data.pop('modifiers', [])
        validated_data['unit_price'] = validated_data['menu_item'].price
        line = super().create(validated_data)
        if modifiers:
            line.modifiers.set(modifiers)
            line.save(update_fields=['line_total', 'updated_at'])
        return line


class SplitBillLineSerializer(serializers.Serializer):
    line = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class SplitBillSerializer(serializers.Serializer):
    lines = SplitBillLineSerializer(many=True)


class TransferTableSerializer(serializers.Serializer):
    table = serializers.PrimaryKeyRelatedField(queryset=RestaurantTable.objects.all())


class MergeOrderSerializer(serializers.Serializer):
    target_order = serializers.PrimaryKeyRelatedField(queryset=RestaurantOrder.objects.all())


class VoidOrderLineSerializer(serializers.Serializer):
    line = serializers.PrimaryKeyRelatedField(queryset=RestaurantOrderLine.objects.all())
    reason = serializers.CharField(required=False, allow_blank=True)


class ApplyOrderDiscountSerializer(serializers.Serializer):
    discount_amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.00'))
    reason = serializers.CharField(required=False, allow_blank=True)


class RestaurantOrderPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = RestaurantOrderPayment
        fields = '__all__'
        read_only_fields = ['order', 'cashier_shift', 'paid_at']


class RestaurantOrderApprovalRequestSerializer(serializers.Serializer):
    line = serializers.PrimaryKeyRelatedField(queryset=RestaurantOrderLine.objects.all(), required=False, allow_null=True)
    discount_amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.00'), required=False)
    reason = serializers.CharField(required=False, allow_blank=True)


class RestaurantOrderApprovalDecisionSerializer(serializers.Serializer):
    decision_notes = serializers.CharField(required=False, allow_blank=True)


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
    payments = RestaurantOrderPaymentSerializer(many=True, read_only=True)
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


class RestaurantOrderApprovalSerializer(serializers.ModelSerializer):
    order_details = RestaurantOrderSerializer(source='order', read_only=True)
    line_details = RestaurantOrderLineSerializer(source='line', read_only=True)
    action_type_display = serializers.CharField(source='get_action_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    requested_by_email = serializers.EmailField(source='requested_by.email', read_only=True)
    decided_by_email = serializers.EmailField(source='decided_by.email', read_only=True)

    class Meta:
        model = RestaurantOrderApproval
        fields = '__all__'
        read_only_fields = ['status', 'requested_by', 'decided_by', 'decided_at']


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
