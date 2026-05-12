from rest_framework import serializers

from inventory.models import InventoryItem, StockMovement, Vendor


class VendorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vendor
        fields = '__all__'


class InventoryItemSerializer(serializers.ModelSerializer):
    current_stock = serializers.DecimalField(max_digits=12, decimal_places=3, read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = InventoryItem
        fields = '__all__'


class StockMovementSerializer(serializers.ModelSerializer):
    item_details = InventoryItemSerializer(source='item', read_only=True)
    vendor_details = VendorSerializer(source='vendor', read_only=True)
    total_cost = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = StockMovement
        fields = '__all__'
        read_only_fields = ['occurred_at', 'created_by']


class ReceiveStockSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(queryset=InventoryItem.objects.filter(is_active=True))
    vendor = serializers.PrimaryKeyRelatedField(queryset=Vendor.objects.filter(is_active=True), required=False, allow_null=True)
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=0.001)
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0)
    reference = serializers.CharField(max_length=120, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    payment_account = serializers.ChoiceField(choices=['1000', '1010', '2000'], default='2000')


class AdjustStockSerializer(serializers.Serializer):
    item = serializers.PrimaryKeyRelatedField(queryset=InventoryItem.objects.filter(is_active=True))
    movement_type = serializers.ChoiceField(choices=['waste', 'adjustment_in', 'adjustment_out'])
    quantity = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=0.001)
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False)
    reference = serializers.CharField(max_length=120, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
